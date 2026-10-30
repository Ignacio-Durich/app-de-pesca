// Formularios de la pantalla Mapa: marcar punto, cargar sondeo y editar spot (spec §2.3).
import { useState } from 'preact/hooks'
import { toDegMin } from '../map/nav.js'

const TIDES = ['creciente', 'pleamar', 'bajante', 'bajamar']
const numOrNull = (v) => (v === '' ? null : Number(v))
const val = (set) => (e) => set(e.currentTarget.value)
// `required` acepta solo espacios: se valida el nombre ya recortado (el error lo muestra useSubmit).
const nameOf = (name) => {
  const n = name.trim()
  if (!n) throw new Error('Poné un nombre.')
  return n
}

// Mismo texto que Emergencias (spec §5): sin coordenadas no se guarda ningún punto.
export function GpsHelp({ err, onClose }) {
  return (
    <div class="card stack">
      {err === 'denied' ? (
        <p>
          No tenemos permiso para usar el GPS. Activá la ubicación del teléfono (Ajustes del sistema) y
          permitila para este sitio en los permisos del navegador. Después volvé a abrir esta pantalla.
        </p>
      ) : err === 'unavailable' ? (
        <p>Este dispositivo o navegador no tiene GPS disponible.</p>
      ) : (
        <p>Buscando señal de GPS… Hace falta tu posición: esperá unos segundos y probá de nuevo.</p>
      )}
      {onClose && <button class="btn" onClick={onClose}>Cerrar</button>}
    </div>
  )
}

function Buttons({ busy, label, onCancel }) {
  return (
    <div class="row">
      <button class="btn ghost" type="button" onClick={onCancel}>Cancelar</button>
      <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : label}</button>
    </div>
  )
}

const DepthInput = ({ label, value, set, required }) => (
  <label>
    {label}
    <input type="number" inputMode="decimal" min="0" step="any" value={value} onInput={val(set)} required={required} />
  </label>
)

// onSave(fields) puede lanzar: el error se muestra y el formulario queda abierto.
function useSubmit(onSave) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = (fields) => async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(fields())
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

export function MarkForm({ at, defaultName, onSave, onCancel }) {
  const [name, setName] = useState(defaultName)
  const [depth, setDepth] = useState('')
  const { busy, error, submit } = useSubmit(onSave)
  return (
    <form class="card stack" onSubmit={submit(() => ({ name: nameOf(name), depth_m: numOrNull(depth) }))}>
      <h2>Marcar punto</h2>
      <p class="muted small">{toDegMin(at.latitude, at.longitude)}</p>
      <label>Nombre <input value={name} onInput={val(setName)} required /></label>
      <DepthInput label="Profundidad en m (opcional)" value={depth} set={setDepth} />
      {error && <p class="error">{error}</p>}
      <Buttons busy={busy} label="Guardar punto" onCancel={onCancel} />
    </form>
  )
}

export function SoundingForm({ at, onSave, onCancel }) {
  const [depth, setDepth] = useState('')
  const { busy, error, submit } = useSubmit(onSave)
  return (
    <form class="card stack" onSubmit={submit(() => Number(depth))}>
      <h2>Cargar sondeo</h2>
      <p class="muted small">{toDegMin(at.latitude, at.longitude)}</p>
      <DepthInput label="Profundidad medida en m (sonda o guía)" value={depth} set={setDepth} required />
      <p class="muted small">Se guarda con la altura de marea de ahora (pronóstico guardado) para compararlo con otros días.</p>
      {error && <p class="error">{error}</p>}
      <Buttons busy={busy} label="Guardar sondeo" onCancel={onCancel} />
    </form>
  )
}

// Cualquier integrante puede editar (spec §2.3). Especies separadas por coma.
export function SpotEditor({ spot, onSave, onCancel }) {
  const [name, setName] = useState(spot.name ?? '')
  const [species, setSpecies] = useState((spot.species ?? []).join(', '))
  const [tide, setTide] = useState(spot.best_tide ?? '')
  const [depth, setDepth] = useState(spot.depth_m == null ? '' : String(spot.depth_m))
  const [notes, setNotes] = useState(spot.notes ?? '')
  const { busy, error, submit } = useSubmit(onSave)
  const fields = () => ({
    name: nameOf(name),
    species: species.split(',').map((s) => s.trim()).filter(Boolean),
    best_tide: tide || null,
    depth_m: numOrNull(depth),
    notes: notes.trim() || null,
  })
  return (
    <form class="stack" onSubmit={submit(fields)}>
      <label>Nombre <input value={name} onInput={val(setName)} required /></label>
      <label>Especies (separadas por coma) <input value={species} onInput={val(setSpecies)} /></label>
      <label>
        Marea recomendada
        <select value={tide} onChange={val(setTide)}>
          <option value="">Sin dato</option>
          {TIDES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <DepthInput label="Profundidad en m (opcional)" value={depth} set={setDepth} />
      <label>Notas <input value={notes} onInput={val(setNotes)} /></label>
      {error && <p class="error">{error}</p>}
      <Buttons busy={busy} label="Guardar cambios" onCancel={onCancel} />
    </form>
  )
}
