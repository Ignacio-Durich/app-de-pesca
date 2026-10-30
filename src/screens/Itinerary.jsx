import { useState } from 'preact/hooks'
import { saveRow, deleteRow } from '../lib/repo.js'
import { useRows } from '../lib/useRows.js'
import { toInstant, fromInstant } from '../lib/time.js'
import { dayLabel } from '../forecast/view.js'

const T = 'itinerary_items'

export function Itinerary({ trip, tripId }) {
  const [rows, reload] = useRows(T, tripId)
  const [date, setDate] = useState(trip.start_date)
  const [time, setTime] = useState('08:00')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  const add = async (e) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || !date || !time) return
    setTitle('')
    setNotes('')
    await saveRow(T, tripId, {
      id: crypto.randomUUID(), trip_id: tripId, starts_at: toInstant(date, time), title: t, notes: notes.trim() || null,
    })
    reload()
  }
  const remove = async (r) => {
    await deleteRow(T, tripId, r.id)
    reload()
  }
  const sorted = [...rows].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))

  return (
    <section class="stack">
      <h1>Itinerario</h1>
      <form class="card stack" onSubmit={add}>
        <div class="row">
          <label>Fecha <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} required /></label>
          <label>Hora <input type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} required /></label>
        </div>
        <label>
          Título
          <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Ej.: Salida" />
        </label>
        <label>
          Notas (opcional)
          <input value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
        </label>
        <button class="btn primary" type="submit">Agregar</button>
      </form>
      {sorted.length === 0 && <p class="muted">Todavía no hay nada en el itinerario.</p>}
      <ul class="list">
        {sorted.map((r) => {
          const { date: d, time: h } = fromInstant(r.starts_at)
          return (
            <li key={r.id} class="item">
              <div class="grow">
                <strong>{dayLabel(d)} · {h}</strong> {r.title}
                {r.notes && <div class="muted small">{r.notes}</div>}
              </div>
              <button class="btn ghost fit" aria-label={`Borrar ${r.title}`} onClick={() => remove(r)}>Borrar</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
