// "Preparar viaje" (spec §2.9): baja lo necesario para usar el viaje sin señal y guarda qué quedó.
// Retoma donde quedó (spec §5, Review Focus 4): lo que ya está guardado no se vuelve a pedir.
import { getForecast as defaultGetForecast } from '../forecast/cache.js'
import { pull as repoPull, pullCatchesNear as repoPullNear, nearScope } from '../lib/repo.js'
import { makeClient } from '../lib/db.js'
import { localGet, localSet } from '../lib/local.js'
import { withTimeout, timeoutSignal } from '../lib/timeout.js'
import { parseLocal, fromInstant } from '../lib/time.js'
import { regionFor, regionKey, downloadRegion } from '../map/basemap.js'
import { tilesInRadius, depthTileUrl, DEPTH_CACHE, satTileUrl, SAT_CACHE } from '../map/tiles.js'
import { zoneRadiusKm } from '../map/nav.js'
import { ZONE_RADIUS_KM } from '../score/config.js'
import { satStore as defaultSatStore } from '../map/satStore.js'

// [diseño] spec §3.4: teselas de profundidad de zoom 8 a 10 en un radio de 250 km (el grupo hace más de
// 4 h de viaje por día; OSRM, 30/10: Bahía Blanca 4,4 h, Caleta de los Loros 4,2 h, Las Grutas 4,4 h,
// las tres dentro de 250 km en línea recta). Medido el 30/10 en 8
// puntos del mar de San Blas: z8–10 dan entre −2 y −25 m, z11–12 dan 0 m (sin batimetría). Desde z11
// se agranda la z10, que ya tiene más detalle que ETOPO1 (~1,8 km por celda).
export const DEPTH_RADIUS_KM = ZONE_RADIUS_KM.mar
export const DEPTH_ZMIN = 8
export const DEPTH_ZMAX = 10
// [diseño] satélite de zoom 8 a 13 en el mismo radio: con 10 m por píxel, z13 (~15 m) ya muestra todo el
// detalle; más cerca el mapa agranda la z13.
export const SAT_ZMIN = 8
export const SAT_ZMAX = 13
export const SAVE_EVERY_TILES = 300 // [diseño] cada cuánto se guarda el avance: si se corta, no se pierde la cuenta
export const DEPTH_PARALLEL = 6 // [diseño] pedidos a la vez: de a uno eran ~3 teselas/s (medido en la prueba local, 30/10)
// [diseño] Medido el 4/11 en WebKit de Mac, alternando sobre teselas mezcladas (3 rondas de 100, sin errores):
// de a 6, 18,9 teselas/s en promedio; de a 12, 28,7. Con 12 siempre en curso daba 36,9, pero no se hizo: cambia cómo
// se corta y se pausa la descarga, y son ~3 min menos.
export const SAT_PARALLEL = 12
// [diseño] spec §2.9: cartel si faltan 48 h o menos para el viaje y los datos tienen más de 12 h
// (o nunca se preparó). "Datos" = el pronóstico (forecastAt).
export const REMIND_WITHIN_H = 48
export const STALE_AFTER_H = 12
export const PHOTO_CACHE = 'photos-v1'
// Medido el 30/10 en la prueba local (San Blas, 80 km, z8–10): 60 teselas = 3,1 MB en depth-v1.
// ponytail: a 250 km son 412 teselas; se estima con el mismo promedio (~52 KB por tesela).
export const DEPTH_MB_PER_TILE = 3.1 / 60
// Muestra del 30/10 (40 teselas por zoom, 250 km alrededor de San Blas): z8 9,0 KB, z9 6,5, z10 5,8,
// z11 4,9, z12 4,5, z13 6,1 KB en promedio → ~145 MB las 24.688 teselas.
export const SAT_MB_ESTIMATED = 145
// Velocidad real de descarga de a 12, medida el 4/11 desde la Mac con wifi (en iPhone no se midió). Varía mucho
// entre pruebas, por eso se muestra un rango: 28,7 por segundo es el promedio en WebKit y 11,1 lo peor de todas
// (una muestra de 120 en Chromium).
export const SAT_TILES_PER_S_FAST = 28.7
export const SAT_TILES_PER_S_SLOW = 11.1
const minutes = (tiles, perS) => Math.ceil(tiles / perS / 60)
export function satTime(tiles) {
  const low = minutes(tiles, SAT_TILES_PER_S_FAST), high = minutes(tiles, SAT_TILES_PER_S_SLOW)
  return low === high ? `${low} min` : `${low}–${high} min`
}
// Teselas que faltan bajar: lo guardado solo cuenta si es de la zona actual.
export const satMissing = (total, status) => (status?.sat?.total === total ? total - status.sat.done : total)

// [diseño] tiempo máximo por pedido: uno colgado no deja "Preparando…" para siempre.
export const FETCH_TIMEOUT_MS = 20000 // teselas, fotos
export const STEP_TIMEOUT_MS = 30000 // pronóstico y cada tabla del pull (supabase-js no recibe signal acá)

const TRIP_TABLES = ['trips', 'checklist_items', 'itinerary_items', 'catches']
const NEAR_TABLES = ['spots', 'soundings']

export const statusKey = (tripId) => `prepare:${tripId}`
// Río (spec §8.5): las teselas globales no tienen datos en el río, la capa de profundidad no se baja.
export const depthTiles = (trip) => (trip.water === 'rio' ? [] : tilesInRadius(trip.lat, trip.lon, zoneRadiusKm(trip), DEPTH_ZMIN, DEPTH_ZMAX))
export const satTiles = (trip) => tilesInRadius(trip.lat, trip.lon, zoneRadiusKm(trip), SAT_ZMIN, SAT_ZMAX)
// La zona creció (80 → 250 km el 30/10): lo guardado antes no la cubre y hay que tocar Actualizar.
export const zoneChanged = (trip, status) =>
  !!status && (status.depth?.total !== depthTiles(trip).length || (status.sat !== null && status.sat?.total !== satTiles(trip).length))
// Listo de verdad: sin faltantes y con todo lo elegido completo (una corrida cortada no llega a anotar faltantes).
const full = (p) => !!p && p.done === p.total
export const isReady = (s) => !!s && s.missing.length === 0 && !!s.dataAt && full(s.depth) && (!s.sat || full(s.sat))
// Mientras se vuelve a revisar, lo guardado no baja: las teselas siguen ahí aunque todavía no se hayan recontado.
// Hay satélite guardado a la manera vieja (sat-v1): la app tarda en abrir hasta que se pasa a IndexedDB.
export const needsSatMove = (s) => !!s?.sat && !s.satDb
// Una descarga quedó a medias, por ejemplo porque se cerró la app.
export const needsResume = (s) => !!s && (!full(s.depth) || (!!s.sat && !full(s.sat)))
const atLeast = (cur, low) => (cur && low?.total === cur.total && low.done > cur.done ? { ...cur, done: low.done } : cur)
const why = (e) => (e?.name === 'QuotaExceededError' ? 'sin espacio en el teléfono' : e?.name === 'PausedError' ? 'la pausaste' : 'sin señal o se cortó')

function supabaseDeps(tripId) {
  const client = makeClient(tripId)
  return {
    pull: (table, scope) => repoPull(client, table, scope),
    pullCatchesNear: (lat, lon, km) => repoPullNear(client, lat, lon, km),
    photoUrl: (path) => client.storage.from('catch-photos').getPublicUrl(path).data.publicUrl,
  }
}

async function cacheOnce(cache, url, fetchImpl) {
  // ignoreVary como los lectores (sw.js): con Vary: Origin si no, cada "Actualizar" vuelve a bajar todo.
  if (await cache.match(url, { ignoreVary: true })) return
  const res = await fetchImpl(url, { signal: timeoutSignal(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await cache.put(url, res)
}

// De a tandas. Una tesela que falla se saltea y se reintenta la próxima vez (lo ya guardado en
// la caché no se vuelve a pedir). Si falla una tanda entera (sin señal o sin espacio) se corta ahí.
// prog = {done, total} (done = teselas guardadas). Devuelve el texto para "missing", o null si están todas.
async function cacheTiles(open, urls, parallel, fetchImpl, prog, onBatch, beforeBatch) {
  let failed = 0, lastError = null
  try {
    const cache = await open()
    for (let i = 0; i < urls.length; i += parallel) {
      await beforeBatch()
      const batch = await Promise.allSettled(urls.slice(i, i + parallel).map((u) => cacheOnce(cache, u, fetchImpl)))
      const bad = batch.filter((r) => r.status === 'rejected')
      prog.done += batch.length - bad.length
      failed += bad.length
      onBatch()
      if (bad.length) lastError = bad[0].reason
      if (bad.length === batch.length) break
    }
  } catch (e) {
    lastError = e
  }
  return prog.done < prog.total ? `${prog.done} de ${prog.total} teselas${failed ? `, ${failed} con error` : ''} (${why(lastError)})` : null
}

// PrepareStatus = {forecastAt, regionAt, regionNote, depth: {done, total}, sat: {done, total} | null (no lo eligió), satDb: el satélite ya está todo en IndexedDB, dataAt, photos: {done, total}, missing: string[]}
// Se guarda en prepare:<tripId> después de cada paso. onProgress({step, done?, total?}).
export async function prepareTrip(trip, opts = {}) {
  const sb = opts.pull && opts.photoUrl && opts.pullCatchesNear ? {} : supabaseDeps(trip.id)
  const {
    onProgress = () => {},
    fetch: fetchImpl = globalThis.fetch,
    caches: cachesImpl = globalThis.caches,
    satStore = defaultSatStore,
    getForecast = defaultGetForecast,
    pull = sb.pull,
    pullCatchesNear = sb.pullCatchesNear,
    photoUrl = sb.photoUrl,
    get = localGet,
    set = localSet,
    mapBaseUrl = import.meta.env.VITE_MAP_BASE_URL,
    tiles = depthTiles(trip),
    sat = satTiles(trip),
    withSat = true, // la persona elige si baja el satélite (~145 MB)
    beforeBatch = async () => {}, // espera (o corta, si rechaza) antes de cada tanda: ver src/prepare/run.js
    now = Date.now,
  } = opts
  const iso = () => new Date(now()).toISOString()
  const prev = (await get(statusKey(trip.id))) ?? {}
  const s = {
    forecastAt: prev.forecastAt ?? null,
    regionAt: prev.regionAt ?? null,
    regionNote: null,
    depth: { done: 0, total: tiles.length },
    // Sin satélite no se toca lo que ya se haya bajado.
    sat: withSat ? { done: 0, total: sat.length } : prev.sat ?? null,
    satDb: prev.satDb === true,
    dataAt: prev.dataAt ?? null,
    photos: { done: 0, total: 0 },
    missing: [],
  }
  // Lo guardado antes vale hasta que termina el paso; al terminar manda la cuenta nueva (puede ser menor).
  const floor = { depth: prev.depth, sat: withSat ? prev.sat : null }
  const save = () => set(statusKey(trip.id), { ...s, depth: atLeast(s.depth, floor.depth), sat: atLeast(s.sat, floor.sat) })
  const tick = (step, prog) => {
    let saved = 0
    return () => {
      onProgress({ step, ...prog })
      if (prog.done - saved >= SAVE_EVERY_TILES) {
        saved = prog.done
        Promise.resolve(save()).catch(() => {}) // solo el avance: el guardado final es el que importa
      }
    }
  }

  // 1. Pronóstico: getForecast usa la copia local si tiene menos de 1 h.
  onProgress({ step: 'forecast' })
  const f = await withTimeout(getForecast(trip, { now: now(), fetchImpl }), STEP_TIMEOUT_MS).catch((e) => ({ error: e.message }))
  if (f.forecast) s.forecastAt = f.forecast.fetchedAt
  if (f.error || !f.forecast) s.missing.push('Pronóstico: sin señal o se cortó')
  if (trip.water === 'rio' && f.forecast?.levelError) s.missing.push('Altura del río: no se pudo bajar')
  await save()

  // 2. Mapa base de la región (R20: sin VITE_MAP_BASE_URL se saltea con aviso).
  const region = regionFor(trip.lat, trip.lon)
  if (!mapBaseUrl) s.regionNote = 'Mapa base todavía no configurado'
  else if (!region) s.regionNote = 'Todavía no hay mapa base para este lugar'
  // Si el guardado no pesa lo que dice regions.json, el mapa se actualizó: se baja de nuevo.
  else if ((await get(regionKey(region)))?.size === region.bytes) s.regionAt ??= iso()
  else {
    s.regionAt = null
    try {
      await beforeBatch()
      onProgress({ step: 'region', done: 0, total: region.bytes ?? 0 })
      await downloadRegion(region, (p) => onProgress({ step: 'region', ...p }), { fetch: fetchImpl, set, baseUrl: mapBaseUrl, stallMs: FETCH_TIMEOUT_MS })
      s.regionAt = iso()
    } catch (e) {
      s.missing.push(`Mapa base: ${why(e)}`)
    }
  }
  await save()

  // 3. Profundidad y satélite.
  const depthMiss = await cacheTiles(() => cachesImpl.open(DEPTH_CACHE), tiles.map(depthTileUrl), DEPTH_PARALLEL, fetchImpl, s.depth, tick('depth', s.depth), beforeBatch)
  floor.depth = null
  if (depthMiss) s.missing.push(`Profundidad: ${depthMiss}`)
  await save()
  if (withSat) {
    // Lo que un teléfono ya bajó en sat-v1 (hasta el 4/11) se copia sin volver a pedirlo; sat-v1 se borra al final.
    const old = await cachesImpl?.has(SAT_CACHE).then((yes) => (yes ? cachesImpl.open(SAT_CACHE) : null)).catch(() => null)
    const satFetch = old ? async (url, o) => (await old.match(url, { ignoreVary: true })) ?? fetchImpl(url, o) : fetchImpl
    s.satDb = !old // sin sat-v1 todo lo bajado ya está en IndexedDB, aunque esta corrida se corte
    const satMiss = await cacheTiles(async () => satStore, sat.map(satTileUrl), SAT_PARALLEL, satFetch, s.sat, tick('sat', s.sat), beforeBatch)
    floor.sat = null
    if (satMiss) s.missing.push(`Satélite: ${satMiss}`)
    else if (old) await cachesImpl.delete(SAT_CACHE).catch(() => {})
    s.satDb = !satMiss || !old
    await save()
  }

  // 4. Datos compartidos: todas las tablas del viaje, y spots y sondeos de la zona.
  onProgress({ step: 'data' })
  const scope = nearScope(trip.lat, trip.lon)
  const pulled = await Promise.allSettled([
    ...TRIP_TABLES.map((t) => withTimeout(pull(t, trip.id), STEP_TIMEOUT_MS)),
    ...NEAR_TABLES.map((t) => withTimeout(pull(t, scope), STEP_TIMEOUT_MS)),
  ])
  if (pulled.every((r) => r.status === 'fulfilled')) s.dataAt = iso()
  else s.missing.push('Datos del viaje: sin señal o se cortó')
  await save()

  // 4b. Capturas del grupo cerca (mar y río): se muestran en "dónde pescar"; sin esto, sin señal quedan vacías.
  try {
    await withTimeout(pullCatchesNear(trip.lat, trip.lon, zoneRadiusKm(trip)), STEP_TIMEOUT_MS)
  } catch {
    s.missing.push('Capturas del grupo: sin señal')
  }
  await save()

  // 5. Fotos de las capturas: una vez cada una; las que fallan se reintentan la próxima.
  // ponytail: si el pull de capturas falló no se miran las fotos; sin señal igual no bajarían.
  const catches = pulled[TRIP_TABLES.indexOf('catches')].value ?? []
  const paths = catches.map((c) => c.photo_path).filter(Boolean)
  s.photos.total = paths.length
  try {
    const cache = await cachesImpl.open(PHOTO_CACHE)
    for (const p of paths) {
      await cacheOnce(cache, photoUrl(p), fetchImpl).then(() => s.photos.done++, () => {})
      onProgress({ step: 'photos', ...s.photos })
    }
  } catch { /* sin Cache API: queda en missing */ }
  if (s.photos.done < s.photos.total) s.missing.push(`Fotos: ${s.photos.done} de ${s.photos.total}`)
  await save()
  return s
}

// nowLocal: 'YYYY-MM-DDTHH:MM' en hora del lugar (forecast/view nowLocal o time.fromInstant).
export function needsReminder(trip, status, nowLocal) {
  const now = parseLocal(nowLocal)
  const untilH = (parseLocal(`${trip.start_date}T00:00`) - now) / 60
  const ended = now >= parseLocal(`${trip.end_date}T00:00`) + 1440
  if (ended || untilH > REMIND_WITHIN_H) return false
  if (!status?.forecastAt) return true
  const { date, time } = fromInstant(status.forecastAt)
  return (now - parseLocal(`${date}T${time}`)) / 60 > STALE_AFTER_H
}
