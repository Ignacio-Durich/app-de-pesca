import { useState } from 'preact/hooks'
import { saveRow, deleteRow } from '../lib/repo.js'
import { useRows } from '../lib/useRows.js'

const T = 'checklist_items'

export function Checklist({ trip, tripId }) {
  const [rows, reload] = useRows(T, tripId)
  const [text, setText] = useState('')
  const [who, setWho] = useState('')

  const add = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    await saveRow(T, tripId, {
      id: crypto.randomUUID(), trip_id: tripId, text: t, who: who || null, done: false, created_at: new Date().toISOString(),
    })
    reload()
  }
  const toggle = async (r) => {
    await saveRow(T, tripId, { ...r, done: !r.done })
    reload()
  }
  const remove = async (r) => {
    await deleteRow(T, tripId, r.id)
    reload()
  }
  // Pendientes primero; los tildados al final. Dentro de cada grupo, por orden de carga.
  const sorted = [...rows].sort((a, b) => a.done - b.done || (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  return (
    <section class="stack">
      <h1>Checklist</h1>
      <form class="card stack" onSubmit={add}>
        <label>
          Qué hay que llevar
          <input value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Ej.: carnada" />
        </label>
        <label>
          Quién lo lleva (opcional)
          <select value={who} onChange={(e) => setWho(e.currentTarget.value)}>
            <option value="">Sin asignar</option>
            {trip.members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button class="btn primary" type="submit">Agregar</button>
      </form>
      {sorted.length === 0 && <p class="muted">Todavía no hay nada en la lista.</p>}
      <ul class="list">
        {sorted.map((r) => (
          <li key={r.id} class={r.done ? 'item done' : 'item'}>
            <label class="check">
              <input type="checkbox" checked={!!r.done} onChange={() => toggle(r)} />
              <span class="grow">
                {r.text}
                {r.who && <small class="muted"> · {r.who}</small>}
              </span>
            </label>
            <button class="btn ghost fit" aria-label={`Borrar ${r.text}`} onClick={() => remove(r)}>Borrar</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
