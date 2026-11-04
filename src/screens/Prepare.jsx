// "Preparar viaje" (spec §2.9), el cartel que lo recuerda y la guía de instalación en iPhone (spec §3.4).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Link } from '../nav.jsx'
import { localGet } from '../lib/local.js'
import { fromInstant } from '../lib/time.js'
import { dayLabel, dec } from '../forecast/view.js'
import { regionFor } from '../map/basemap.js'
import { prepareTrip, needsReminder, needsSatMove, zoneChanged, isReady, statusKey, depthTiles, satTiles, DEPTH_MB_PER_TILE, SAT_MB_ESTIMATED, satMinutes } from '../prepare/prepare.js'

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
  sat: (p) => `Satélite: ${p.done} de ${p.total} teselas${p.left ? ` · faltan unos ${p.left} min` : ''}`,
  data: () => 'Datos del viaje…',
  photos: (p) => `Fotos: ${p.done} de ${p.total}`,
}

// Pantalla prendida mientras baja: bloqueada, el iPhone corta la descarga. Si el teléfono no lo permite no pasa
// nada: la pantalla igual pide dejarla prendida. Se suelta al salir de la app: se vuelve a pedir al volver.
function useKeepAwake(on) {
  useEffect(() => {
    if (!on) return
    let alive = true, lock = null
    const take = () => navigator.wakeLock?.request('screen').then((l) => (alive ? (lock = l) : l.release()), () => {})
    const back = () => document.visibilityState === 'visible' && take()
    take()
    document.addEventListener('visibilitychange', back)
    return () => {
      alive = false
      lock?.release().catch(() => {})
      document.removeEventListener('visibilitychange', back)
    }
  }, [on])
}

export function Prepare({ trip, tripId }) {
  const [status, setStatus] = useState(undefined)
  const [guarded, setGuarded] = useState(null) // lo guardado está protegido de que el teléfono lo borre; null: no se sabe
  const [prog, setProg] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { localGet(statusKey(tripId)).then((s) => setStatus(s ?? null), () => setStatus(null)) }, [tripId])
  useEffect(() => { navigator.storage?.persisted?.().then(setGuarded, () => {}) }, [])
  useKeepAwake(!!prog)

  const region = regionFor(trip.lat, trip.lon)
  const configured = !!import.meta.env.VITE_MAP_BASE_URL
  const tileCount = useMemo(() => depthTiles(trip).length, [trip.lat, trip.lon])
  const satCount = useMemo(() => satTiles(trip).length, [trip.lat, trip.lon])

  // Minutos que faltan del satélite, con la velocidad de los últimos 15 s de esta descarga
  // (lo que ya estaba guardado pasa enseguida y no dice cuánto tarda el resto).
  const satStart = useRef(null)
  const onProgress = (p) => {
    if (p.step !== 'sat') return setProg(p)
    const t = Date.now(), e = (satStart.current ??= { t, done: p.done, left: null })
    const secs = (t - e.t) / 1000
    if (secs >= 15) {
      const rate = (p.done - e.done) / secs
      Object.assign(e, { t, done: p.done, left: rate > 0 ? Math.ceil((p.total - p.done) / rate / 60) : null })
    }
    setProg(e.left ? { ...p, left: e.left } : p)
  }

  const run = async (withSat) => {
    if (prog) return
    satStart.current = null
    // Pedir que el navegador no borre lo guardado (spec §3.4), cada vez: puede no darlo la primera.
    navigator.storage?.persist?.().then(setGuarded, () => {})
    setError(null)
    setProg({ step: 'forecast' })
    try {
      setStatus(await prepareTrip({ ...trip, id: tripId }, { onProgress, withSat }))
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
          <li>Profundidad: {tileCount} teselas (unos {Math.round(tileCount * DEPTH_MB_PER_TILE)} MB)</li>
          <li>Satélite (si lo elegís): {satCount} teselas (en San Blas, unos {SAT_MB_ESTIMATED} MB)</li>
          <li>Spots, sondeos, checklist, itinerario y capturas, con sus fotos</li>
        </ul>
        <p class="muted small">Conviene hacerlo con wifi.</p>
      </div>

      {prog ? (
        <button class="btn big primary" disabled>Preparando…</button>
      ) : (
        <div class="card stack">
          <h2>¿Bajar también la vista satelital?</h2>
          <p class="muted small">
            Ocupa unos {SAT_MB_ESTIMATED} MB más y con wifi tarda unos {satMinutes(satCount)} minutos (medido en una prueba;
            si ya bajaste una parte, menos). Sin satélite el mapa igual tiene calles, costa y profundidad.
          </p>
          <button class="btn big primary" onClick={() => run(true)} disabled={s === undefined}>
            {s ? 'Actualizar' : 'Preparar'} con satélite (~{satMinutes(satCount)} min)
          </button>
          <button class="btn big" onClick={() => run(false)} disabled={s === undefined}>
            {s ? 'Actualizar' : 'Preparar'} sin satélite
          </button>
        </div>
      )}
      {prog && (
        <div class="card" aria-live="polite">
          <p>{STEP[prog.step]?.(prog)}</p>
          <p class="muted small">Dejá la app abierta y la pantalla prendida. Si se corta, tocá Actualizar y sigue desde donde quedó.</p>
          {prog.total ? <progress class="bar" value={prog.done} max={prog.total} /> : <progress class="bar" />}
        </div>
      )}
      {error && <p class="error">{error}</p>}

      {s && (
        <div class="card">
          {needsSatMove(s) && !prog && (
            <p class="error">Para que la app abra rápido, tocá “Actualizar con satélite”: pasa lo ya bajado a otro lugar del teléfono, sin volver a bajarlo.</p>
          )}
          {zoneChanged(trip, s) && <p class="error">La zona ahora es de 250 km: tocá Actualizar para bajar lo que falta.</p>}
          {!prog && !isReady(s) && s.missing.length === 0 && !zoneChanged(trip, s) && (
            <p class="error">Se cortó antes de terminar: tocá Actualizar y sigue desde donde quedó.</p>
          )}
          {isReady(s) && !zoneChanged(trip, s) && (
            <p class="ready">Listo para offline ✓{s.regionNote ? ' (sin mapa base)' : ''} · datos {when(s.dataAt)}</p>
          )}
          <h2>Guardado en el teléfono</h2>
          <ul class="list">
            <li>{ok(s.forecastAt)} Pronóstico{s.forecastAt && ` · ${when(s.forecastAt)}`}</li>
            <li>{ok(s.regionAt)} Mapa base{s.regionAt ? ` · ${when(s.regionAt)}` : s.regionNote ? ` · ${s.regionNote}` : ''}</li>
            <li>{ok(s.depth.total && s.depth.done === s.depth.total)} Profundidad · {s.depth.done} de {s.depth.total} teselas</li>
            {s.sat ? <li>{ok(s.sat.total && s.sat.done === s.sat.total)} Satélite · {s.sat.done} de {s.sat.total} teselas</li>
              : <li>— Satélite · no se bajó (se ve solo con señal)</li>}
            <li>{ok(s.dataAt)} Spots, sondeos, checklist, itinerario y capturas{s.dataAt && ` · ${when(s.dataAt)}`}</li>
            <li>{ok(s.photos.done === s.photos.total)} Fotos · {s.photos.done} de {s.photos.total}</li>
          </ul>
          {guarded === false && (
            <p class="muted small">
              {isIos() && !isInstalled()
                ? 'Estás en Safari: el iPhone puede borrar lo guardado. Abrí la app desde el ícono.'
                : 'El teléfono no marcó lo guardado como protegido: si se queda sin espacio, puede borrarlo.'}
            </p>
          )}
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
  const [show, setShow] = useState(null) // null | el texto del cartel
  useEffect(() => {
    let alive = true
    localGet(statusKey(tripId))
      .then((s) => alive && setShow(
        needsSatMove(s) ? 'La app abre lenta: tocá acá y después “Actualizar con satélite” →'
          : needsReminder(trip, s ?? null, nowLocalIso()) ? 'Falta poco para el viaje: prepará el teléfono para usar la app sin señal →'
          : null,
      ))
      .catch(() => {})
    return () => { alive = false }
  }, [tripId, tab, trip.start_date, trip.end_date])
  if (!show || tab === 'preparar') return null
  return (
    <Link class="banner remind" href={`/t/${tripId}/preparar`}>{show}</Link>
  )
}

// Guía de "Agregar a pantalla de inicio" en iPhone (spec §3.4): Safari borra los datos de un sitio
// tras 7 días sin usarlo; la app instalada no. Se muestra hasta que se cierra, una vez por teléfono.
const GUIDE_KEY = 'installGuideDismissed'
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isInstalled = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
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
