import species from '../data/species.json'
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

export function Species() {
  return (
    <section class="stack">
      <h1>Especies y reglamento</h1>
      <div class="card">
        <p>{note}</p>
        <p><a href="https://www.gba.gob.ar/desarrollo_agrario/pesca/pesca_deportiva" target="_blank" rel="noopener">Página oficial de pesca deportiva (gba.gob.ar)</a></p>
        <p class="muted">{seasonNote.text}</p>
      </div>

      {species.map((s) => (
        <div class="card" key={s.id}>
          <h2>{s.name}</h2>
          {s.scientific && <p class="muted"><em>{s.scientific}</em></p>}
          <Field label="Categoría">{s.category}</Field>
          <Field label="Talla mínima">{s.minSizeCm != null ? `${s.minSizeCm} cm` : null}</Field>
          <Field label="Cupo diario">{s.dailyLimit}</Field>
          <Field label="Devolución">{s.release}</Field>
          <Field label="Carnada">{s.bait}</Field>
          <Field label="Época">{s.season}</Field>
          {s.notes && <p class="muted">{s.notes}</p>}
          <Sources list={s.sources} />
        </div>
      ))}

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
