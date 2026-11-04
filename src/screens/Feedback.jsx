import { useState } from 'preact/hooks'
import { makeClient } from '../lib/db.js'
import { FeedbackError, sendFeedback, deviceLine } from '../lib/feedback.js'
import { isInstalled } from './Prepare.jsx'
import { TABS, MAS_ITEMS } from './tabs.jsx'

// Pantalla desde la que se tocó el 🐞 (?desde=mapa): [clave, nombre], o null si se entró por Más o el valor
// no es una pantalla. Se arma al usarla: tabs.jsx importa este archivo (import circular).
const fromScreen = () => {
  const k = new URLSearchParams(location.search).get('desde')
  return [...TABS, ...MAS_ITEMS, ['emergencias', 'Emergencias']].find(([key]) => key === k) ?? null
}

const messages = {
  invalid_feedback: 'El comentario tiene que tener entre 1 y 2000 letras.',
  too_many: 'Se mandaron muchos hoy. Probá mañana.',
  network: 'No se pudo mandar. Probá de nuevo con señal.',
}

export function Feedback({ tripId, me }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const from = fromScreen()

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    setSent(false)
    setError(null)
    try {
      await sendFeedback(makeClient(tripId), body, me, from?.[0] ?? null, await deviceLine(isInstalled()))
      setBody('')
      setSent(true)
    } catch (err) {
      setError(err instanceof FeedbackError ? err.kind : 'network')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class="stack">
      <h1>Comentarios y errores</h1>
      <form class="card stack" onSubmit={send}>
        {from && <p class="muted small">Desde la pantalla: <strong>{from[1]}</strong></p>}
        <label>
          Contanos qué mejorar o qué falló
          <textarea rows={5} maxLength={2000} value={body} onInput={(e) => { setBody(e.currentTarget.value); setSent(false) }} />
        </label>
        <button class="btn primary" type="submit" disabled={busy || !body.trim()}>{busy ? 'Mandando…' : 'Mandar'}</button>
        <p role="status" class="muted">{sent && '¡Gracias! Nacho lo va a leer.'}</p>
        {error && <p role="alert" class="error">{messages[error]}</p>}
      </form>
    </section>
  )
}
