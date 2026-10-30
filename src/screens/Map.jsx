// Mapa (spec §2.3): mapa base offline, profundidad, spots, sondeos y herramientas GPS. Todo sale de lo
// guardado en el teléfono; spots y sondeos se refrescan con red si hay.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Link } from '../nav.jsx'
import { saveRow, nearScope } from '../lib/repo.js'
import { useRows } from '../lib/useRows.js'
import { toInstant, fromInstant } from '../lib/time.js'
import { cachedForecast } from '../forecast/cache.js'
import { findExtremes } from '../forecast/tides.js'
import { dec, dayLabel } from '../forecast/view.js'
import { conditionsAt } from '../catches/conditions.js'
import { regionFor, basemapLayer } from '../map/basemap.js'
import { DEPTH_CACHE } from '../map/tiles.js'
import { toDegMin, within, distanceBearing } from '../map/nav.js'
import { depthAt, soundingDatum, bandColor, BANDS, BAND_M } from '../map/depth.js'
import { GoTo, distLabel } from '../components/GoTo.jsx'
import { GpsHelp, MarkForm, SoundingForm, SpotEditor } from '../components/MapForms.jsx'

export const SPOTS_RADIUS_KM = 50 // [diseño] spec §2.3: spots y sondeos a menos de 50 km del lugar
const START_ZOOM = 11 // [diseño]
const MAX_ZOOM = 16 // [diseño] el mapa base llega a z15; un nivel más agrandado
const DEPTH_ATTRIBUTION = 'Profundidad: Terrain Tiles (AWS Open Data)'
const WARNING = 'Profundidad orientativa, no apta para navegar'
const LEGEND = `linear-gradient(to right, ${Array.from({ length: BANDS }, (_, b) =>
  `rgb(${bandColor(b)}) ${(b * 100) / BANDS}% ${((b + 1) * 100) / BANDS}%`).join(', ')})`

const nowTrip = () => fromInstant(new Date().toISOString())
const depthText = (alt) => (alt == null ? 'sin dato' : `${dec(-alt, 1)} m`)
const m = (v) => `${dec(Number(v), 1)} m`
const openDepth = () => (globalThis.caches ? caches.open(DEPTH_CACHE).catch(() => null) : Promise.resolve(null))

// Popup con texto plano: nombres y notas son de otros usuarios, nunca van como HTML.
const textEl = (text) => Object.assign(document.createElement('div'), { textContent: text, style: 'white-space: pre-line' })

export function MapScreen({ trip, me, tripId }) {
  const scope = useMemo(() => nearScope(trip.lat, trip.lon), [trip.lat, trip.lon])
  const [spotRows, reloadSpots] = useRows('spots', scope, tripId)
  const [soundRows, reloadSoundings] = useRows('soundings', scope, tripId)
  const spots = useMemo(() => within(spotRows, trip.lat, trip.lon, SPOTS_RADIUS_KM), [spotRows, trip.lat, trip.lon])
  const soundings = useMemo(
    () => within(soundRows, trip.lat, trip.lon, SPOTS_RADIUS_KM).sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at)),
    [soundRows, trip.lat, trip.lon],
  )

  const el = useRef(null)
  const lm = useRef(null) // { L, map, cache, depth, spotsG, soundG, meG }
  const [ready, setReady] = useState(false)
  const [base, setBase] = useState(null) // null mientras carga | 'on' | 'none'
  const [depthOn, setDepthOn] = useState(true)
  const [pos, setPos] = useState(null)
  const [gpsErr, setGpsErr] = useState(null) // 'denied' | 'unavailable' | 'waiting'
  const [posDepth, setPosDepth] = useState(null)
  const [selId, setSelId] = useState(null)
  const [mode, setMode] = useState(null) // 'mark' | 'sound' | 'edit' | 'go'
  const [at, setAt] = useState(null) // posición tomada al abrir "Marcar punto" o "Cargar sondeo"
  const [msg, setMsg] = useState(null)
  const [loadErr, setLoadErr] = useState(false)
  const sel = spots.find((s) => s.id === selId)
  const probe = (lat, lon) => (lm.current?.cache ? depthAt(lat, lon, lm.current.cache) : Promise.resolve(null))

  // GPS (como Emergencias). Se limpia al salir de la pantalla.
  useEffect(() => {
    if (!navigator.geolocation) { setGpsErr('unavailable'); return }
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos(p.coords); setGpsErr(null) },
      (e) => setGpsErr(e.code === 1 ? 'denied' : 'waiting'),
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Leaflet se carga dinámico (fuera del bundle inicial). Sin mapa base: fondo liso con lo demás (R21).
  useEffect(() => {
    let alive = true, map
    ;(async () => {
      const mods = await Promise.all([
        import('leaflet'), import('../map/depthLayer.js'), openDepth(), import('leaflet/dist/leaflet.css'),
      ]).catch(() => null)
      if (!alive) return
      // Sin el código del mapa (app sin cachear y sin señal): aviso en vez de un mapa en blanco.
      if (!mods) return setLoadErr(true)
      const [{ default: L }, { depthLayer }, cache] = mods
      window.L ??= L
      map = L.map(el.current, { maxZoom: MAX_ZOOM }).setView([trip.lat, trip.lon], START_ZOOM)
      map.attributionControl.addAttribution(DEPTH_ATTRIBUTION)
      const g = { L, map, cache, depth: cache && depthLayer(cache) }
      for (const k of ['spotsG', 'soundG', 'meG']) g[k] = L.layerGroup().addTo(map)
      map.on('click', async (e) => {
        const popup = L.popup().setLatLng(e.latlng).setContent('Profundidad: …').openOn(map)
        const alt = await probe(e.latlng.lat, e.latlng.lng)
        popup.setContent(textEl(`Profundidad: ${depthText(alt)}\n${WARNING}`))
      })
      lm.current = g
      setReady(true)
      const region = regionFor(trip.lat, trip.lon)
      const layer = region && (await basemapLayer(region).catch(() => null))
      if (!alive) return
      if (layer) layer.setZIndex(0).addTo(map)
      setBase(layer ? 'on' : 'none')
    })()
    return () => {
      alive = false
      map?.remove()
      lm.current = null
      setReady(false)
    }
  }, [trip.lat, trip.lon])

  useEffect(() => {
    const g = lm.current
    if (!ready || !g?.depth) return
    if (depthOn) g.depth.addTo(g.map)
    else g.depth.remove()
  }, [ready, depthOn])

  useEffect(() => {
    if (!ready || !lm.current) return
    const { L, spotsG } = lm.current
    spotsG.clearLayers()
    for (const s of spots) {
      L.circleMarker([s.lat, s.lon], {
        radius: 10, color: '#fff', weight: 2, fillOpacity: 1, bubblingMouseEvents: false,
        fillColor: s.id === selId ? '#c62828' : '#a15c00',
      }).on('click', () => { setSelId(s.id); setMode(null) }).addTo(spotsG)
    }
  }, [ready, spots, selId])

  // Sondeos numerados por orden de carga (spec §2.3).
  useEffect(() => {
    if (!ready || !lm.current) return
    const { L, soundG } = lm.current
    soundG.clearLayers()
    soundings.forEach((s, i) => {
      const { date, time } = fromInstant(s.measured_at)
      const lines = [
        `Sondeo ${i + 1} · ${dayLabel(date)} ${time}${s.created_by ? ` · ${s.created_by}` : ''}`,
        `Medido: ${m(s.depth_measured_m)}`,
        s.tide_height_m == null ? 'Marea: sin dato' : `Marea: ${m(s.tide_height_m)}`,
        s.depth_datum_m == null ? 'Sin marea: no se puede comparar con otros días' : `Referido al mismo nivel: ${m(s.depth_datum_m)}`,
      ]
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'sounding-pin', html: String(i + 1), iconSize: [26, 26] }) })
        .bindPopup(textEl(lines.join('\n'))).addTo(soundG)
    })
  }, [ready, soundings])

  useEffect(() => {
    if (!ready || !lm.current) return
    const { L, meG } = lm.current
    meG.clearLayers()
    if (!pos) return
    const ll = [pos.latitude, pos.longitude]
    if (pos.accuracy) L.circle(ll, { radius: pos.accuracy, weight: 1, fillOpacity: 0.1, interactive: false }).addTo(meG)
    L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1565c0', fillOpacity: 1, interactive: false }).addTo(meG)
    let ok = true
    probe(pos.latitude, pos.longitude).then((a) => ok && setPosDepth(a))
    return () => { ok = false }
  }, [ready, pos])

  const open = (k) => { setMode(k); setAt(pos); setMsg(null) }
  const close = () => setMode(null)
  const focus = (s) => { setSelId(s.id); setMode(null); lm.current?.map.setView([s.lat, s.lon]) }

  const markSpot = async (fields) => {
    await saveRow('spots', scope, {
      id: crypto.randomUUID(), lat: at.latitude, lon: at.longitude, species: [], best_tide: null, notes: null,
      created_by: me ?? null, created_at: new Date().toISOString(), ...fields,
    })
    await reloadSpots()
    close()
  }
  const editSpot = async (fields) => {
    await saveRow('spots', scope, { ...sel, ...fields })
    await reloadSpots()
    close()
  }
  const addSounding = async (measured) => {
    const t = nowTrip()
    const f = (await cachedForecast(trip)).forecast ?? { hours: [] }
    const tide = conditionsAt(f, findExtremes(f.hours), `${t.date}T${t.time}`).tide_height_m
    const datum = soundingDatum(measured, tide)
    await saveRow('soundings', scope, {
      id: crypto.randomUUID(), lat: at.latitude, lon: at.longitude, depth_measured_m: measured,
      tide_height_m: tide, depth_datum_m: datum, measured_at: toInstant(t.date, t.time), created_by: me ?? null,
    })
    await reloadSoundings()
    close()
    setMsg(datum == null
      ? `Sondeo guardado: ${m(measured)}. Sin marea en el pronóstico guardado, queda solo lo medido.`
      : `Sondeo guardado: ${m(measured)} medido, marea ${m(tide)}, referido al mismo nivel ${m(datum)}.`)
  }

  const from = pos ? [pos.latitude, pos.longitude] : [trip.lat, trip.lon]
  const list = spots
    .map((s) => ({ s, km: distanceBearing(from[0], from[1], s.lat, s.lon).km }))
    .sort((a, b) => a.km - b.km)

  return (
    <section class="stack">
      <h1>Mapa</h1>
      <p class="banner amber">{WARNING}</p>
      {base === 'none' && (
        <p class="muted small">
          Mapa base no descargado — usá <Link href={`/t/${tripId}/preparar`}>Preparar viaje</Link>.
        </p>
      )}
      {loadErr && <p class="error">No se pudo cargar el mapa. Abrí la app con señal una vez y volvé a esta pantalla.</p>}
      <div ref={el} class="map" />
      <div class="legend">
        <label class="check fit">
          <input type="checkbox" checked={depthOn} onChange={(e) => setDepthOn(e.currentTarget.checked)} />
          Profundidad
        </label>
        <span>0</span><div class="legend-bar" style={{ background: LEGEND }} /><span>{BAND_M * (BANDS - 1)}+ m</span>
      </div>
      <p class="muted small">Tocá el mapa para ver la profundidad de ese punto. Sin la zona descargada: "sin dato".</p>

      <div class="card">
        <h2>Tu posición</h2>
        {pos ? (
          <>
            <p class="coords">{toDegMin(pos.latitude, pos.longitude)}</p>
            <p class="muted">
              {pos.accuracy != null && `±${Math.round(pos.accuracy)} m · `}Profundidad estimada: {depthText(posDepth)}
            </p>
            <button class="btn" onClick={() => lm.current?.map.setView(from)}>Centrar en mí</button>
          </>
        ) : (gpsErr === 'denied' || gpsErr === 'unavailable') ? (
          <GpsHelp err={gpsErr} />
        ) : (
          <p class="muted">Buscando señal de GPS…</p>
        )}
      </div>

      <div class="row">
        <button class="btn big" onClick={() => open('mark')}>Marcar punto</button>
        <button class="btn big" onClick={() => open('sound')}>Cargar sondeo</button>
      </div>
      {msg && <p class="muted">{msg}</p>}
      {(mode === 'mark' || mode === 'sound') && !at && <GpsHelp err={gpsErr} onClose={close} />}
      {mode === 'mark' && at && <MarkForm at={at} defaultName={`Punto ${nowTrip().time}`} onSave={markSpot} onCancel={close} />}
      {mode === 'sound' && at && <SoundingForm at={at} onSave={addSounding} onCancel={close} />}

      {sel && (
        <div class="card stack">
          <h2>{sel.name || 'Spot sin nombre'}</h2>
          <p class="muted small">
            {[
              sel.species?.length && sel.species.join(', '),
              sel.best_tide && `marea: ${sel.best_tide}`,
              sel.depth_m != null && `profundidad: ${m(sel.depth_m)}`,
              sel.created_by && `cargó ${sel.created_by}`,
            ].filter(Boolean).join(' · ') || 'Sin datos'}
          </p>
          {sel.notes && <p>{sel.notes}</p>}
          <p class="muted small">{toDegMin(sel.lat, sel.lon)}</p>
          {mode === 'edit' ? (
            <SpotEditor key={sel.id} spot={sel} onSave={editSpot} onCancel={close} />
          ) : (
            <div class="row">
              <button class="btn" onClick={() => setMode('edit')}>Editar</button>
              <button class="btn primary" onClick={() => setMode(mode === 'go' ? null : 'go')}>Ir a punto</button>
            </div>
          )}
          {mode === 'go' && (pos ? <GoTo pos={pos} target={sel} /> : <GpsHelp err={gpsErr} />)}
        </div>
      )}

      <div class="card">
        <h2>Spots cerca ({SPOTS_RADIUS_KM} km)</h2>
        {list.length === 0 && <p class="muted">Todavía no hay spots en la zona.</p>}
        <ul class="list">
          {list.map(({ s, km }) => (
            <li key={s.id}>
              <button class={`btn ${s.id === selId ? 'primary' : 'ghost'}`} onClick={() => focus(s)}>
                {s.name || 'Spot sin nombre'} · {distLabel(km)}{s.depth_m != null && ` · ${m(s.depth_m)}`}
              </button>
            </li>
          ))}
        </ul>
        {soundings.length > 0 && <p class="muted small">{soundings.length} sondeos del grupo en el mapa (puntos numerados).</p>}
      </div>
    </section>
  )
}
