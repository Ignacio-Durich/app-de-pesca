// "Preparar viaje" (spec §2.9), el cartel que lo recuerda y la guía de instalación en iPhone (spec §3.4).
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Link } from '../nav.jsx'
import { localGet } from '../lib/local.js'
import { fromInstant } from '../lib/time.js'
import { dayLabel, dec } from '../forecast/view.js'
import { regionFor } from '../map/basemap.js'
import { prepareTrip, needsReminder, statusKey, depthTiles, DEPTH_MB_MEASURED } from '../prepare/prepare.js'

const nowTrip = () => fromInstant(new Date().toISOString())
const nowLocalIso = () => { const n = nowTrip(); return `${n.date}T${n.time}` }
function when(iso) {
  const { date, time } = fromInstant(iso)
  return date === nowTrip().date ? `de hoy ${time}` : `del ${dayLabel(date)} ${time}`
}
const mb = (bytes) => `${dec(bytes / 1e6)} MB`

const STEP = {
  forecast: () => 'Pronóstico…',
  region: (p) => (p.total ? `Mapa base: ${mb(p.done)} de ${mb(p.total)}` : `Mapa base: ${mb(p.done ?? 0)}`),
  depth: (p) => `Profundidad: ${p.done} de ${p.total} teselas`,
  data: () => 'Datos del viaje…',
  photos: (p) => `Fotos: ${p.done} de ${p.total}`,
}

export function Prepare({ trip, tripId }) {
  const [status, setStatus] = useState(undefined)
  const [prog, setProg] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { localGet(statusKey(tripId)).then((s) => setStatus(s ?? null), () => setStatus(null)) }, [tripId])

  const region = regionFor(trip.lat, trip.lon)
  const configured = !!import.meta.env.VITE_MAP_BASE_URL
  const tileCount = useMemo(() => depthTiles(trip).length, [trip.lat, trip.lon])

  const run = async () => {
    if (prog) return
    // Primer uso: pedir que el navegador no borre lo guardado (spec §3.4). Se ignora si no se puede.
    if (!status) navigator.storage?.persist?.().catch(() => {})
    setError(null)
    setProg({ step: 'forecast' })
    try {
      setStatus(await prepareTrip({ ...trip, id: tripId }, { onProgress: setProg }))
    } catch (e) {
      setError(`No se pudo terminar: ${e.message || e}. Tocá de nuevo y sigue desde donde quedó.`)
    } finally {
      setProg(null)
    }
  }

  const s = status
  const ok = (cond) => (cond ? '✓' : '—')
  return (
    <section class="stack">
      <h1>Preparar viaje</h1>
      <p class="muted">Guarda en el teléfono todo lo necesario para usar la app sin señal.</p>

      <div class="card">
        <h2>Qué se descarga</h2>
        <ul class="day-info">
          <li>Pronóstico de los días del viaje que ya estén disponibles</li>
          <li>
            {!configured ? 'Mapa base todavía no configurado'
              : !region ? 'Mapa base: todavía no hay mapa para este lugar'
              : `Mapa base (${region.name}): ${region.bytes ? mb(region.bytes) : 'tamaño desconocido'}`}
          </li>
          <li>Profundidad: {tileCount} teselas (en San Blas, unos {dec(DEPTH_MB_MEASURED)} MB)</li>
          <li>Spots, sondeos, checklist, itinerario y capturas, con sus fotos</li>
        </ul>
        <p class="muted small">Conviene hacerlo con wifi.</p>
      </div>

      <button class="btn big primary" onClick={run} disabled={!!prog || s === undefined}>
        {prog ? 'Preparando…' : s ? 'Actualizar' : 'Preparar viaje'}
      </button>
      {prog && (
        <div class="card" aria-live="polite">
          <p>{STEP[prog.step]?.(prog)}</p>
          {prog.total ? <progress class="bar" value={prog.done} max={prog.total} /> : <progress class="bar" />}
        </div>
      )}
      {error && <p class="error">{error}</p>}

      {s && (
        <div class="card">
          {s.missing.length === 0 && s.dataAt && (
            <p class="ready">Listo para offline ✓{s.regionNote ? ' (sin mapa base)' : ''} · datos {when(s.dataAt)}</p>
          )}
          <h2>Guardado en el teléfono</h2>
          <ul class="list">
            <li>{ok(s.forecastAt)} Pronóstico{s.forecastAt && ` · ${when(s.forecastAt)}`}</li>
            <li>{ok(s.regionAt)} Mapa base{s.regionAt ? ` · ${when(s.regionAt)}` : s.regionNote ? ` · ${s.regionNote}` : ''}</li>
            <li>{ok(s.depth.total && s.depth.done === s.depth.total)} Profundidad · {s.depth.done} de {s.depth.total} teselas</li>
            <li>{ok(s.dataAt)} Spots, sondeos, checklist, itinerario y capturas{s.dataAt && ` · ${when(s.dataAt)}`}</li>
            <li>{ok(s.photos.done === s.photos.total)} Fotos · {s.photos.done} de {s.photos.total}</li>
          </ul>
          {s.missing.length > 0 && (
            <div class="mt-s">
              <p class="amber">Falta (tocá “Actualizar” con señal y sigue desde donde quedó):</p>
              <ul class="day-info">{s.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      <footer class="data-age muted">
        Datos: Open-Meteo · Mapa: © OpenStreetMap, Protomaps · Profundidad: Terrain Tiles (AWS Open Data)
      </footer>
    </section>
  )
}

// Cartel en TripShell (spec §2.9). Se relee al cambiar de pestaña, así desaparece después de preparar.
export function PrepareBanner({ trip, tripId, tab }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let alive = true
    localGet(statusKey(tripId))
      .then((s) => alive && setShow(needsReminder(trip, s ?? null, nowLocalIso())))
      .catch(() => {})
    return () => { alive = false }
  }, [tripId, tab, trip.start_date, trip.end_date])
  if (!show || tab === 'preparar') return null
  return (
    <Link class="banner remind" href={`/t/${tripId}/preparar`}>
      Falta poco para el viaje: prepará el teléfono para usar la app sin señal →
    </Link>
  )
}

// Guía de "Agregar a pantalla de inicio" en iPhone (spec §3.4): Safari borra los datos de un sitio
// tras 7 días sin usarlo; la app instalada no. Se muestra hasta que se cierra, una vez por teléfono.
const GUIDE_KEY = 'installGuideDismissed'
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isInstalled = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
const dismissed = () => { try { return localStorage.getItem(GUIDE_KEY) === '1' } catch { return false } }

export function InstallGuide({ tripId }) {
  const [open, setOpen] = useState(() => isIos() && !isInstalled() && !dismissed())
  const [copied, setCopied] = useState(null) // null | true | false (no se pudo: se muestra el link)
  if (!open) return null
  const link = `${location.origin}/t/${tripId}`
  const close = () => {
    try { localStorage.setItem(GUIDE_KEY, '1') } catch { /* modo privado */ }
    setOpen(false)
  }
  const copy = () => navigator.clipboard.writeText(link).then(() => setCopied(true), () => setCopied(false))
  // La app instalada guarda aparte de Safari: el link y "Preparar viaje" se hacen adentro de la app.
  return (
    <div class="card">
      <h2>Instalá la app en el iPhone</h2>
      <p>La app instalada no ve lo que hiciste en Safari. Seguí estos pasos:</p>
      <ol>
        <li>
          Copiá el link del viaje:{' '}
          <button class="btn fit" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar link'}</button>
          {copied === false && <input class="mt" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />}
        </li>
        <li>En Safari tocá <strong>Compartir</strong> y después <strong>“Agregar a pantalla de inicio”</strong>.</li>
        <li>Abrí la app desde el ícono nuevo.</li>
        <li>Pegá el link en <strong>“Abrir un viaje”</strong> y elegí tu nombre.</li>
        <li>Adentro de la app tocá <strong>Preparar viaje</strong> (lo que se preparó en Safari no pasa a la app).</li>
      </ol>
      <p class="muted small">Abrila siempre desde ese ícono: así el iPhone no borra el mapa ni los datos guardados.</p>
      <button class="btn" onClick={close}>Entendido</button>
    </div>
  )
}
