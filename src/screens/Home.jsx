import { useState } from 'preact/hooks'
import { Link, navigate } from '../nav.jsx'
import { createTrip, recentTrips } from '../trips/trips.js'

const num = (s) => (s.trim() === '' ? NaN : Number(s))
// Acepta varios nombres separados por coma; descarta vacíos y repetidos.
const parseNames = (text, have) => text.split(',').map((s) => s.trim()).filter((n, i, a) => n && !have.includes(n) && a.indexOf(n) === i)

export function Home() {
  const [f, setF] = useState({ name: '', placeName: '', lat: '', lon: '', startDate: '', endDate: '', nightFishing: false })
  const [members, setMembers] = useState([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const addMembers = () => {
    const names = parseNames(draft, members)
    if (names.length) setMembers([...members, ...names])
    setDraft('')
  }

  const locate = () => {
    if (!navigator.geolocation) return setError('Este teléfono no permite ubicación.')
    navigator.geolocation.getCurrentPosition(
      (p) => setF((s) => ({ ...s, lat: p.coords.latitude.toFixed(4), lon: p.coords.longitude.toFixed(4) })),
      () => setError('No pude obtener tu ubicación. Cargá latitud y longitud a mano.'),
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    const all = [...members, ...parseNames(draft, members)]
    const lat = num(f.lat), lon = num(f.lon)
    if (!f.name.trim()) return setError('Ponele un nombre al viaje.')
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return setError('Cargá latitud y longitud válidas (ej: -40.55 y -62.23).')
    if (!f.startDate || !f.endDate || f.endDate < f.startDate) return setError('Revisá las fechas: el fin no puede ser antes del inicio.')
    if (!all.length) return setError('Agregá al menos un integrante.')
    setError('')
    setBusy(true)
    try {
      const id = await createTrip({
        name: f.name.trim(), placeName: f.placeName.trim() || f.name.trim(), lat, lon,
        startDate: f.startDate, endDate: f.endDate, members: all, water: 'mar', nightFishing: f.nightFishing,
      })
      navigate(`/t/${id}`)
    } catch {
      setBusy(false)
      setError('No se pudo guardar el viaje en este teléfono. Probá de nuevo.')
    }
  }

  const recents = recentTrips()
  return (
    <main class="page">
      <h1>App de Pesca</h1>
      {recents.length > 0 && (
        <section class="card">
          <h2>Tus viajes</h2>
          <div class="stack">
            {recents.map((t) => <Link key={t.id} class="btn big" href={`/t/${t.id}`}>{t.name}</Link>)}
          </div>
        </section>
      )}
      <form class="card stack" onSubmit={submit}>
        <h2>Crear viaje</h2>
        <label>Nombre<input value={f.name} onInput={set('name')} placeholder="San Blas" /></label>
        <label>Lugar<input value={f.placeName} onInput={set('placeName')} placeholder="Nombre del lugar" /></label>
        <div class="row">
          <label>Latitud<input type="number" step="any" inputMode="decimal" value={f.lat} onInput={set('lat')} /></label>
          <label>Longitud<input type="number" step="any" inputMode="decimal" value={f.lon} onInput={set('lon')} /></label>
        </div>
        <button type="button" class="btn ghost" onClick={locate}>Usar mi ubicación</button>
        <div class="row">
          <label>Desde<input type="date" value={f.startDate} onInput={set('startDate')} /></label>
          <label>Hasta<input type="date" value={f.endDate} onInput={set('endDate')} /></label>
        </div>
        <label>Integrantes
          <div class="row">
            <input
              value={draft}
              onInput={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMembers())}
              placeholder="Nombre (o varios con coma)"
            />
            <button type="button" class="btn fit" onClick={addMembers}>Agregar</button>
          </div>
        </label>
        {members.length > 0 && (
          <div class="chips">
            {members.map((m) => (
              <button key={m} type="button" class="chip" onClick={() => setMembers(members.filter((x) => x !== m))}>{m} ✕</button>
            ))}
          </div>
        )}
        <label class="check"><input type="checkbox" checked={f.nightFishing} onChange={set('nightFishing')} /> Pesca nocturna</label>
        {error && <p class="error" role="alert">{error}</p>}
        <button class="btn primary big" disabled={busy}>Crear viaje</button>
      </form>
    </main>
  )
}
