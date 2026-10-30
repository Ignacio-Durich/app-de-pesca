// Capturas (spec §2.6). Las condiciones salen del pronóstico guardado, así que todo anda sin señal.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { saveRow, deleteRow } from '../lib/repo.js'
import { pending, onQueueChange } from '../lib/queue.js'
import { withTimeout } from '../lib/timeout.js'
import { useRows } from '../lib/useRows.js'
import { makeClient } from '../lib/db.js'
import { toInstant, fromInstant } from '../lib/time.js'
import { cachedForecast } from '../forecast/cache.js'
import { findExtremes } from '../forecast/tides.js'
import { dayLabel, dec } from '../forecast/view.js'
import { cardinal } from '../score/windows.js'
import { conditionsAt } from '../catches/conditions.js'
import { resizePhoto, queuedPhotos } from '../catches/photo.js'
import species from '../data/species.json'

const T = 'catches'
const PHASES = ['creciente', 'pleamar', 'bajante', 'bajamar']
const GPS_TIMEOUT_MS = 8000 // [diseño] espera corta: sin GPS la captura se guarda igual (spec §5)
const GPS_MAX_AGE_MS = 60000 // [diseño] sirve una posición de hasta 1 min
// [diseño] margen extra: el timeout del GPS no corre mientras el cartel de permiso espera respuesta.
const GPS_GRACE_MS = 2000

const nowTrip = () => fromInstant(new Date().toISOString())
// Nunca rechaza: sin permiso, sin GPS o sin respuesta a tiempo da null. El tope propio cubre el
// cartel de permiso sin contestar (ahí el timeout de getCurrentPosition todavía no corre).
const position = () =>
  withTimeout(new Promise((ok) => {
    if (!navigator.geolocation) return ok(null)
    navigator.geolocation.getCurrentPosition((p) => ok(p.coords), () => ok(null), {
      enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: GPS_MAX_AGE_MS,
    })
  }), GPS_TIMEOUT_MS + GPS_GRACE_MS).catch(() => null)
const num = (v, d) => dec(Number(v), d)

export function Catches({ trip, me, tripId }) {
  const [rows, reload] = useRows(T, tripId)
  const client = useMemo(() => makeClient(tripId), [tripId])
  const [sp, setSp] = useState('')
  const [cm, setCm] = useState('')
  const [who, setWho] = useState(me ?? trip.members[0] ?? '')
  const [released, setReleased] = useState(false)
  const [file, setFile] = useState(null)
  const [fileKey, setFileKey] = useState(0)
  const [when, setWhen] = useState(nowTrip)
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [ops, setOps] = useState([])

  // Fotos sin subir: se muestran desde el Blob local (object URL), que se libera al cambiar la cola.
  useEffect(() => {
    const load = () => pending().then(setOps, () => {})
    load()
    return onQueueChange(load)
  }, [])
  const localUrls = useMemo(
    () => new Map([...queuedPhotos(ops)].map(([path, blob]) => [path, URL.createObjectURL(blob)])),
    [ops],
  )
  useEffect(() => () => localUrls.forEach((u) => URL.revokeObjectURL(u)), [localUrls])
  const photoSrc = (path) => localUrls.get(path) ?? client.storage.from('catch-photos').getPublicUrl(path).data.publicUrl

  const editWhen = (k) => (e) => (setWhen({ ...when, [k]: e.currentTarget.value }), setEdited(true))

  const add = async (e) => {
    e.preventDefault()
    const s = sp.trim()
    if (!s || busy) return
    setBusy(true)
    setError(null)
    try {
      const id = crypto.randomUUID()
      // Hora sin tocar = ahora. Si se cargó otra hora, la posición actual no es la de la captura: sin GPS.
      const t = edited ? when : nowTrip()
      const blob = file
        ? await resizePhoto(file).catch(() => { throw new Error('No se pudo procesar la foto. Probá con otra o guardala sin foto.') })
        : null
      const [cached, pos] = await Promise.all([cachedForecast(trip), edited ? null : position()])
      const f = cached.forecast ?? { hours: [] }
      const path = blob ? `${tripId}/${id}.jpg` : null
      await saveRow(T, tripId, {
        id, trip_id: tripId, member: who || null, species: s,
        length_cm: cm === '' ? null : Number(cm), released, photo_path: path,
        caught_at: toInstant(t.date, t.time), lat: pos?.latitude ?? null, lon: pos?.longitude ?? null,
        ...conditionsAt(f, findExtremes(f.hours), `${t.date}T${t.time}`),
      }, blob && { path, blob })
      setSp('')
      setCm('')
      setReleased(false)
      setFile(null)
      setFileKey((k) => k + 1)
      setWhen(nowTrip())
      setEdited(false)
      reload()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la captura.')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (r) => {
    await deleteRow(T, tripId, r.id)
    reload()
  }

  const sorted = [...rows].sort((a, b) => Date.parse(b.caught_at) - Date.parse(a.caught_at))
  const ranking = Object.values(rows.reduce((acc, r) => {
    const k = r.member ?? 'Sin dato'
    const e = (acc[k] ??= { name: k, count: 0, max: null })
    e.count++
    if (r.length_cm != null && (e.max == null || Number(r.length_cm) > e.max)) e.max = Number(r.length_cm)
    return acc
  }, {})).sort((a, b) => b.count - a.count || (b.max ?? 0) - (a.max ?? 0))
  const byPhase = (p) => rows.filter((r) => (r.tide_phase ?? null) === p).length
  const noPhase = byPhase(null)

  return (
    <section class="stack">
      <h1>Capturas</h1>
      <form class="card stack" onSubmit={add}>
        <label>
          Especie
          <input value={sp} onInput={(e) => setSp(e.currentTarget.value)} list="species-list" required />
          <datalist id="species-list">{species.map((s) => <option key={s.name} value={s.name} />)}</datalist>
        </label>
        <div class="row">
          <label>
            Medida en cm (opcional)
            <input type="number" inputMode="decimal" min="0" step="any" value={cm} onInput={(e) => setCm(e.currentTarget.value)} />
          </label>
          <label>
            Quién la sacó
            <select value={who} onChange={(e) => setWho(e.currentTarget.value)}>
              {trip.members.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <label class="check">
          <input type="checkbox" checked={released} onChange={(e) => setReleased(e.currentTarget.checked)} />
          Devuelta al agua
        </label>
        <label>
          Foto (opcional)
          <input key={fileKey} type="file" accept="image/*" onChange={(e) => setFile(e.currentTarget.files[0] ?? null)} />
        </label>
        <div class="row">
          <label>Fecha <input type="date" value={when.date} onInput={editWhen('date')} required /></label>
          <label>Hora <input type="time" value={when.time} onInput={editWhen('time')} required /></label>
        </div>
        {edited && <p class="muted small">Con otra hora no se guarda la ubicación GPS.</p>}
        {error && <p class="error">{error}</p>}
        <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar captura'}</button>
      </form>

      {sorted.length === 0 && <p class="muted">Todavía no hay capturas.</p>}
      <ul class="list">
        {sorted.map((r) => {
          const { date, time } = fromInstant(r.caught_at)
          const cond = [
            r.tide_phase,
            r.tide_height_m != null && `marea ${num(r.tide_height_m, 2)} m`,
            r.wind_kmh != null && `viento ${num(r.wind_kmh, 0)} km/h${r.wind_dir_deg != null ? ` ${cardinal(Number(r.wind_dir_deg))}` : ''}`,
          ].filter(Boolean).join(' · ')
          return (
            <li key={r.id} class="item">
              {r.photo_path && <Thumb key={photoSrc(r.photo_path)} url={photoSrc(r.photo_path)} />}
              <div class="grow">
                <strong>{r.species}</strong>
                {r.length_cm != null && ` · ${String(r.length_cm).replace('.', ',')} cm`}
                <div class="muted small">
                  {r.member ?? 'Sin dato'} · {dayLabel(date)} {time}{r.released && ' · devuelta'}
                </div>
                {cond && <div class="muted small">{cond}</div>}
              </div>
              <button class="btn ghost fit" aria-label={`Borrar ${r.species}`} onClick={() => remove(r)}>Borrar</button>
            </li>
          )
        })}
      </ul>

      {rows.length > 0 && (
        <div class="card">
          <h2>Ranking</h2>
          <table class="mt">
            <thead><tr><th>Integrante</th><th>Capturas</th><th>Mayor</th></tr></thead>
            <tbody>
              {ranking.map((e) => (
                <tr key={e.name}><td>{e.name}</td><td>{e.count}</td><td>{e.max == null ? '–' : `${String(e.max).replace('.', ',')} cm`}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <div class="card">
          <h2>Capturas por fase de marea</h2>
          <table class="mt">
            <tbody>
              {PHASES.map((p) => <tr key={p}><td>{p}</td><td>{byPhase(p)}</td></tr>)}
              {noPhase > 0 && <tr><td>sin dato</td><td>{noPhase}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// Sin señal la foto no carga: no se muestra (key = src: con otro src se vuelve a intentar). Tocarla abre la foto completa.
function Thumb({ url }) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <a href={url} target="_blank" rel="noopener">
      <img class="thumb" src={url} alt="Foto de la captura" onError={() => setOk(false)} />
    </a>
  )
}
