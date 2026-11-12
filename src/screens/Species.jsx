import { useEffect, useState } from 'preact/hooks'
import species from '../data/species.json'
import { keepNote, matches } from '../species/view.js'
import { license, note, seasonNote, rules } from '../data/regulation.json'
import rio from '../data/regulation-rio.json'
import { zonesAt } from '../regulation/zones.js'

const NV = <span class="muted">no verificado</span>

function Sources({ list }) {
  return (
    <p class="muted">
      Fuentes:{' '}
      {list.map((s, i) => (
        <span key={s.url + s.title}>
          {i > 0 && ' · '}
          <a href={s.url} target="_blank" rel="noopener">{s.title}</a>
        </span>
      ))}
    </p>
  )
}

function Field({ label, children }) {
  return <p><strong>{label}:</strong> {children ?? NV}</p>
}

function SpeciesCard({ s }) {
  const [open, setOpen] = useState(false)
  const [big, setBig] = useState(false)
  const keep = keepNote(s)
  return (
    <div class="card sp">
      <div class="sp-head">
        {s.photo && (
          <button type="button" class="sp-photo" aria-label={`Agrandar la foto de ${s.name}`} onClick={() => setBig(true)}>
            <img src={s.photo.src} alt={s.photo.caption} loading="lazy" />
          </button>
        )}
        <div class="sp-sum">
          <h2>{s.name}</h2>
          {s.zones && <p class="muted small">{s.zones.map((z) => rio[z].name).join(' y ')}</p>}
          <p class={keep.release ? 'sp-keep release' : 'sp-keep'}>{keep.text}</p>
          <p><strong>Talla mínima:</strong> {s.minSizeCm != null ? `${s.minSizeCm} cm` : NV}</p>
          <p><strong>Cupo diario:</strong> {s.dailyLimit ?? NV}</p>
        </div>
        <button type="button" class="round" aria-label={open ? 'Ocultar detalle' : 'Ver detalle'} aria-expanded={open} onClick={() => setOpen(!open)}>i</button>
      </div>
      {big && (
        // Pantalla completa: se cierra tocando en cualquier lado (pedido en el feedback del 30/10).
        <div class="lightbox" role="dialog" aria-label={s.photo.caption} onClick={() => setBig(false)}>
          <button type="button" class="lightbox-close" aria-label="Cerrar">✕</button>
          <img src={s.photo.src} alt={s.photo.caption} />
          <p>{s.name} · <em>{s.photo.caption}</em></p>
        </div>
      )}
      {open && (
        <div class="sp-detail">
          {s.scientific && <p class="muted"><em>{s.scientific}</em></p>}
          <Field label="Categoría">{s.category}</Field>
          <Field label="Devolución">{s.release}</Field>
          <Field label="Carnada">{s.bait}</Field>
          <Field label="Época">{s.season}</Field>
          {s.notes && <p class="muted">{s.notes}</p>}
          <Sources list={s.sources} />
          {s.photo && <p class="muted small">
            Foto: <em>{s.photo.caption}</em>{s.photo.author && ` · ${s.photo.author}`} · {s.photo.license} ·{' '}
            <a href={s.photo.page} target="_blank" rel="noopener">Wikimedia Commons</a>
          </p>}
        </div>
      )}
    </div>
  )
}

function Rules({ list }) {
  return (
    <div class="card">
      <h2>Reglas generales</h2>
      <ul>
        {list.map((r) => <li key={r.text}>{r.text} <Sources list={r.sources} /></li>)}
      </ul>
    </div>
  )
}

function License({ lic }) {
  return (
    <div class="card">
      <h2>Licencia de pesca</h2>
      {lic.url && <p><a href={lic.url} target="_blank" rel="noopener">Tramitar la licencia en línea</a></p>}
      <ul>
        {lic.types.map((t) => <li key={t.name}><strong>{t.name}:</strong> {t.duration}</li>)}
      </ul>
      <ul>
        {lic.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <Sources list={lic.sources} />
    </div>
  )
}

// GPS solo si el permiso ya está dado: esta pantalla no pide permiso (spec §8.4). Si no, el lugar del viaje.
function useRiverPosition(trip) {
  const [gps, setGps] = useState(null)
  useEffect(() => {
    let id = null, alive = true
    navigator.permissions?.query({ name: 'geolocation' }).then((p) => {
      if (!alive || p.state !== 'granted' || !navigator.geolocation) return
      id = navigator.geolocation.watchPosition((pos) => setGps(pos.coords), () => {}, { maximumAge: 60000 })
    }).catch(() => {})
    return () => { alive = false; if (id != null) navigator.geolocation.clearWatch(id) }
  }, [])
  return gps ? { lat: gps.latitude, lon: gps.longitude, from: 'tu GPS' } : { lat: trip.lat, lon: trip.lon, from: 'el lugar del viaje' }
}

function RiverSpecies({ trip, q, setQ }) {
  const pos = useRiverPosition(trip)
  const zones = zonesAt(pos.lat, pos.lon)
  const shown = species.filter((s) => s.waters.includes('rio') && (!zones.length || s.zones.some((z) => zones.includes(z))) && matches(s, q))
  return (
    <section class="stack">
      <h1>Especies y reglamento</h1>
      <input type="search" placeholder="Buscar especie" aria-label="Buscar especie" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      <div class="card">
        {zones.length
          ? <p>Orilla según {pos.from}: <strong>{zones.map((z) => rio[z].name).join(' y ')}</strong>.</p>
          : <p>Según {pos.from}, estás fuera de las zonas cargadas (Buenos Aires y Entre Ríos cerca de Lima): se muestran las dos.</p>}
        {zones.length > 1 && <p class="sp-keep release">Cerca del límite entre provincias: valen las dos</p>}
        <p class="muted small">Límite entre provincias aproximado, de OpenStreetMap (© OpenStreetMap contributors, ODbL).</p>
      </div>

      {shown.map((s) => <SpeciesCard key={s.id} s={s} />)}
      {shown.length === 0 && <p class="muted">Ninguna especie coincide con "{q}".</p>}

      {(zones.length ? zones : ['ba', 'er']).map((z) => (
        <div key={z} class="stack">
          <h2>{rio[z].name}</h2>
          <div class="card"><p>{rio[z].note}</p></div>
          <Rules list={rio[z].rules} />
          <License lic={rio[z].license ?? license} />
        </div>
      ))}
    </section>
  )
}

export function Species({ trip }) {
  const [q, setQ] = useState('')
  if (trip?.water === 'rio') return <RiverSpecies trip={trip} q={q} setQ={setQ} />
  const shown = species.filter((s) => s.waters.includes('mar') && matches(s, q))
  return (
    <section class="stack">
      <h1>Especies y reglamento</h1>
      <input type="search" placeholder="Buscar especie" aria-label="Buscar especie" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      <div class="card">
        <p>{note}</p>
        <p><a href="https://www.gba.gob.ar/desarrollo_agrario/pesca/pesca_deportiva" target="_blank" rel="noopener">Página oficial de pesca deportiva (gba.gob.ar)</a></p>
        <p class="muted">{seasonNote.text}</p>
      </div>

      {shown.map((s) => <SpeciesCard key={s.id} s={s} />)}
      {shown.length === 0 && <p class="muted">Ninguna especie coincide con "{q}".</p>}

      <Rules list={rules} />
      <License lic={license} />
    </section>
  )
}
