// "Dónde" (spec §8.6): pesqueros ordenados por puntaje, con su "por qué". Todo sale de lo guardado.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Link } from '../nav.jsx'
import { listRows, nearScope } from '../lib/repo.js'
import { useRows } from '../lib/useRows.js'
import { rankForTrip, mergeCatches } from '../score/spots.js'
import { SPOT, WINDOW_MIN } from '../score/config.js'
import { dec, hhmm } from '../forecast/view.js'

const NOTICE = 'Al principio casi todos los lugares tienen el mismo puntaje: solo los distinguen sus reglas y lo que pesquen ustedes. Carguen las capturas en el lugar donde salieron.' // spec §8.6, aviso fijo

// Capturas del grupo guardadas por "Preparar viaje" (pueden faltar: se cuenta como vacío), más las del viaje,
// así lo que se carga durante el viaje cuenta sin volver a preparar.
export function useGroupCatches(trip, tripId) {
  const [rows, setRows] = useState([])
  const [own] = useRows('catches', tripId)
  useEffect(() => {
    let alive = true
    listRows('catchesNear', nearScope(trip.lat, trip.lon)).then((r) => alive && setRows(r ?? []), () => {})
    return () => { alive = false }
  }, [trip.lat, trip.lon])
  return useMemo(() => mergeCatches(rows, own), [rows, own])
}

// Spots de la zona ordenados para un día y un modo (null mientras no haya pronóstico).
export function useRanked(trip, tripId, forecast, mode, day) {
  const [spots] = useRows('spots', nearScope(trip.lat, trip.lon), tripId)
  const catches = useGroupCatches(trip, tripId)
  return useMemo(
    () => (forecast ? rankForTrip(trip, forecast, spots, catches, mode, day) : null),
    [trip, forecast, spots, catches, mode, day],
  )
}

// El texto es de otros usuarios: se parte en pedazos y solo los https:// pasan a ser link (nunca HTML).
function Text({ text }) {
  return text.split(/(https?:\/\/\S+)/).map((p, i) =>
    i % 2 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p)
}

export function Lines({ lines }) {
  return (
    <ul class="why">
      {lines.map((l, i) => (
        <li key={i} class={l.origin === 'aviso' ? 'amber' : ''}>
          <Text text={l.text} />{l.origin === 'diseño' && ' (regla de diseño)'}
        </li>
      ))}
    </ul>
  )
}

export function WhereSection({ trip, tripId, forecast, mode, day }) {
  const ranked = useRanked(trip, tripId, forecast, mode, day)
  const [all, setAll] = useState(false)
  if (!ranked) return null
  const shown = all ? ranked : ranked.slice(0, SPOT.top)
  return (
    <section class="card stack">
      <h2>Dónde</h2>
      {ranked.length === 0 && <p class="muted">Todavía no hay lugares cargados. Marcalos en el Mapa con 'Marcar punto'.</p>}
      {shown.map((r) => (
        <div key={r.spot.id} class="where">
          <Link href={`/t/${tripId}/mapa?spot=${r.spot.id}`} class="where-head">
            <span class={r.score >= WINDOW_MIN ? 'where-score' : 'where-score weak'}>{r.score}/10</span>
            <span class="where-text">
              <strong>{r.spot.name || 'Spot sin nombre'}</strong>
              <span class="muted small">{[r.best && hhmm(r.best.t), r.km != null && `${dec(r.km, 1)} km`].filter(Boolean).join(' · ')}</span>
            </span>
          </Link>
          <details>
            <summary>Por qué</summary>
            <Lines lines={r.lines} />
          </details>
        </div>
      ))}
      {ranked.length > SPOT.top && (
        <button class="btn" onClick={() => setAll(!all)} aria-expanded={all}>{all ? 'Ver menos' : `Ver todos (${ranked.length})`}</button>
      )}
      <p class="muted small">{NOTICE}</p>
    </section>
  )
}
