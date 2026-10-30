// "Preparar viaje" (spec §2.9): baja lo necesario para usar el viaje sin señal y guarda qué quedó.
// Retoma donde quedó (spec §5, Review Focus 4): lo que ya está guardado no se vuelve a pedir.
import { getForecast as defaultGetForecast } from '../forecast/cache.js'
import { pull as repoPull, nearScope } from '../lib/repo.js'
import { makeClient } from '../lib/db.js'
import { localGet, localSet } from '../lib/local.js'
import { parseLocal, fromInstant } from '../lib/time.js'
import { regionFor, regionKey, downloadRegion } from '../map/basemap.js'
import { tilesInRadius, depthTileUrl, DEPTH_CACHE } from '../map/tiles.js'

// [diseño] spec §3.4: teselas de profundidad de zoom 8 a 12 en un radio de 80 km.
export const DEPTH_RADIUS_KM = 80
export const DEPTH_ZMIN = 8
export const DEPTH_ZMAX = 12
export const DEPTH_PARALLEL = 6 // [diseño] pedidos a la vez: de a uno eran ~3 teselas/s (medido en la prueba local, 30/10)
// [diseño] spec §2.9: cartel si faltan 48 h o menos para el viaje y los datos tienen más de 12 h
// (o nunca se preparó). "Datos" = el pronóstico (forecastAt).
export const REMIND_WITHIN_H = 48
export const STALE_AFTER_H = 12
export const PHOTO_CACHE = 'photos-v1'
// Medido el 30/10 en la prueba local (San Blas, 80 km, z8–12): 710 teselas = 13,7 MB en depth-v1.
export const DEPTH_MB_MEASURED = 13.7

// [diseño] tiempo máximo por pedido: uno colgado no deja "Preparando…" para siempre.
export const FETCH_TIMEOUT_MS = 20000 // teselas, fotos
export const STEP_TIMEOUT_MS = 30000 // pronóstico y cada tabla del pull (supabase-js no recibe signal acá)

const TRIP_TABLES = ['trips', 'checklist_items', 'itinerary_items', 'catches']
const NEAR_TABLES = ['spots', 'soundings']

export const statusKey = (tripId) => `prepare:${tripId}`
export const depthTiles = (trip) => tilesInRadius(trip.lat, trip.lon, DEPTH_RADIUS_KM, DEPTH_ZMIN, DEPTH_ZMAX)
const why = (e) => (e?.name === 'QuotaExceededError' ? 'sin espacio en el teléfono' : 'sin señal o se cortó')

function supabaseDeps(tripId) {
  const client = makeClient(tripId)
  return {
    pull: (table, scope) => repoPull(client, table, scope),
    photoUrl: (path) => client.storage.from('catch-photos').getPublicUrl(path).data.publicUrl,
  }
}

// ponytail: la carrera no cancela el pedido de abajo; solo deja de esperarlo.
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, fail) => setTimeout(() => fail(new Error('timeout')), ms))])
const timeoutSignal = (ms) => AbortSignal.timeout?.(ms) // Safari < 16 no lo tiene: sin límite

async function cacheOnce(cache, url, fetchImpl) {
  if (await cache.match(url)) return
  const res = await fetchImpl(url, { signal: timeoutSignal(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await cache.put(url, res)
}

// PrepareStatus = {forecastAt, regionAt, regionNote, depth: {done, total}, dataAt, photos: {done, total}, missing: string[]}
// Se guarda en prepare:<tripId> después de cada paso. onProgress({step, done?, total?}).
export async function prepareTrip(trip, opts = {}) {
  const sb = opts.pull && opts.photoUrl ? {} : supabaseDeps(trip.id)
  const {
    onProgress = () => {},
    fetch: fetchImpl = globalThis.fetch,
    caches: cachesImpl = globalThis.caches,
    getForecast = defaultGetForecast,
    pull = sb.pull,
    photoUrl = sb.photoUrl,
    get = localGet,
    set = localSet,
    mapBaseUrl = import.meta.env.VITE_MAP_BASE_URL,
    tiles = depthTiles(trip),
    now = Date.now,
  } = opts
  const iso = () => new Date(now()).toISOString()
  const prev = (await get(statusKey(trip.id))) ?? {}
  const s = {
    forecastAt: prev.forecastAt ?? null,
    regionAt: prev.regionAt ?? null,
    regionNote: null,
    depth: { done: 0, total: tiles.length },
    dataAt: prev.dataAt ?? null,
    photos: { done: 0, total: 0 },
    missing: [],
  }
  const save = () => set(statusKey(trip.id), s)

  // 1. Pronóstico: getForecast usa la copia local si tiene menos de 1 h.
  onProgress({ step: 'forecast' })
  const f = await withTimeout(getForecast(trip, { now: now(), fetchImpl }), STEP_TIMEOUT_MS).catch((e) => ({ error: e.message }))
  if (f.forecast) s.forecastAt = f.forecast.fetchedAt
  if (f.error || !f.forecast) s.missing.push('Pronóstico: sin señal o se cortó')
  await save()

  // 2. Mapa base de la región (R20: sin VITE_MAP_BASE_URL se saltea con aviso).
  const region = regionFor(trip.lat, trip.lon)
  if (!mapBaseUrl) s.regionNote = 'Mapa base todavía no configurado'
  else if (!region) s.regionNote = 'Todavía no hay mapa base para este lugar'
  else if (await get(regionKey(region))) s.regionAt ??= iso()
  else {
    s.regionAt = null
    try {
      onProgress({ step: 'region', done: 0, total: region.bytes ?? 0 })
      await downloadRegion(region, (p) => onProgress({ step: 'region', ...p }), { fetch: fetchImpl, set, baseUrl: mapBaseUrl, stallMs: FETCH_TIMEOUT_MS })
      s.regionAt = iso()
    } catch (e) {
      s.missing.push(`Mapa base: ${why(e)}`)
    }
  }
  await save()

  // 3. Profundidad: de a DEPTH_PARALLEL. Una tesela que falla se saltea y se reintenta la próxima vez
  // (lo ya guardado en la caché no se vuelve a pedir). Si falla una tanda entera (sin señal o sin
  // espacio) se corta ahí. done = teselas guardadas.
  let failed = 0, lastError = null
  try {
    const cache = await cachesImpl.open(DEPTH_CACHE)
    for (let i = 0; i < tiles.length; i += DEPTH_PARALLEL) {
      const batch = await Promise.allSettled(tiles.slice(i, i + DEPTH_PARALLEL).map((t) => cacheOnce(cache, depthTileUrl(t), fetchImpl)))
      const bad = batch.filter((r) => r.status === 'rejected')
      s.depth.done += batch.length - bad.length
      failed += bad.length
      onProgress({ step: 'depth', ...s.depth })
      if (bad.length) lastError = bad[0].reason
      if (bad.length === batch.length) break
    }
  } catch (e) {
    lastError = e
  }
  if (s.depth.done < s.depth.total) {
    s.missing.push(`Profundidad: ${s.depth.done} de ${s.depth.total} teselas${failed ? `, ${failed} con error` : ''} (${why(lastError)})`)
  }
  await save()

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
