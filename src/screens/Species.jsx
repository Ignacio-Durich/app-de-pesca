import { useState } from 'preact/hooks'
import species from '../data/species.json'
import { keepNote, matches } from '../species/view.js'
import { license, note, seasonNote, rules } from '../data/regulation.json'

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
        <button type="button" class="sp-photo" aria-label={`Agrandar la foto de ${s.name}`} onClick={() => setBig(true)}>
          <img src={s.photo.src} alt={s.photo.caption} loading="lazy" />
        </button>
        <div class="sp-sum">
          <h2>{s.name}</h2>
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
          <p class="muted small">
            Foto: <em>{s.photo.caption}</em>{s.photo.author && ` · ${s.photo.author}`} · {s.photo.license} ·{' '}
            <a href={s.photo.page} target="_blank" rel="noopener">Wikimedia Commons</a>
          </p>
        </div>
      )}
    </div>
  )
}

export function Species() {
  const [q, setQ] = useState('')
  const shown = species.filter((s) => matches(s, q))
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

      <div class="card">
        <h2>Reglas generales</h2>
        <ul>
          {rules.map((r) => <li key={r.text}>{r.text} <Sources list={r.sources} /></li>)}
        </ul>
      </div>

      <div class="card">
        <h2>Licencia de pesca</h2>
        <p><a href={license.url} target="_blank" rel="noopener">Tramitar la licencia en línea</a></p>
        <ul>
          {license.types.map((t) => <li key={t.name}><strong>{t.name}:</strong> {t.duration}</li>)}
        </ul>
        <ul>
          {license.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <Sources list={license.sources} />
      </div>
    </section>
  )
}
