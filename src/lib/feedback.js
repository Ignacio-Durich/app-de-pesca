// Comentarios y errores (como en Pelis by Pili): van a la tabla feedback por la función send_feedback
// (supabase/migrations/002_feedback.sql). Sin cola offline: se manda con señal o avisa que no salió.
const KINDS = ['invalid_feedback', 'too_many']

export class FeedbackError extends Error {
  constructor(kind) {
    super(kind)
    this.kind = kind
  }
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
