// Comentarios y errores (como en Pelis by Pili): van a la tabla feedback por la función send_feedback
// (supabase/migrations/002_feedback.sql). Sin cola offline: se manda con señal o avisa que no salió.
import { withTimeout } from './timeout.js'

const KINDS = ['invalid_feedback', 'too_many']

export class FeedbackError extends Error {
  constructor(kind) {
    super(kind)
    this.kind = kind
  }
}

// Datos técnicos que acompañan al comentario, para entender problemas del teléfono sin adivinar:
// si está abierta desde el ícono, si lo guardado está protegido, cuánto ocupa y cuánto tardó en cargar.
const orUnknown = (v, text) => (v == null ? '?' : text(v))
export const deviceInfo = ({ installed, persisted, usageBytes, loadMs }) => [
  `app:${installed ? 'icono' : 'navegador'}`,
  `protegido:${orUnknown(persisted, (p) => (p ? 'si' : 'no'))}`,
  `usado:${orUnknown(usageBytes, (b) => `${Math.round(b / 1e6)}MB`)}`,
  `carga:${orUnknown(loadMs, (ms) => `${(ms / 1000).toFixed(1)}s`)}`,
].join(' ')

// Va adelante del navegador: la base recorta la columna a 300 caracteres. Si el teléfono no responde, sale igual.
export async function deviceLine(installed) {
  const [persisted, estimate] = await withTimeout(
    Promise.all([navigator.storage?.persisted?.(), navigator.storage?.estimate?.()]), 1000,
  ).catch(() => [])
  const loadMs = performance.getEntriesByType?.('navigation')?.[0]?.domContentLoadedEventEnd || null
  return `${deviceInfo({ installed, persisted, usageBytes: estimate?.usage, loadMs })} | ${navigator.userAgent}`
}

export async function sendFeedback(client, body, author, page, userAgent) {
  let error
  try {
    ;({ error } = await client.rpc('send_feedback', { p_body: body.trim(), p_author: author, p_page: page, p_user_agent: userAgent }))
  } catch {
    throw new FeedbackError('network')
  }
  if (error) throw new FeedbackError(KINDS.find((k) => error.message?.includes(k)) ?? 'network')
}
