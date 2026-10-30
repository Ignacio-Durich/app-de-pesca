// Límites de tiempo para pedidos de red (los usan Preparar, la base y el pronóstico).

// ponytail: la carrera no cancela el pedido de abajo; solo deja de esperarlo.
export const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, fail) => setTimeout(() => fail(new Error('timeout')), ms))])

// Señal que aborta a los `ms` (o antes, si aborta `parent`). AbortController + setTimeout en vez de
// AbortSignal.timeout/any: anda igual en Safari < 16/17 (que no los tienen).
export function timeoutSignal(ms, parent) {
  const c = new AbortController()
  setTimeout(() => c.abort(new Error('timeout')), ms)
  if (parent?.aborted) c.abort(parent.reason)
  else parent?.addEventListener('abort', () => c.abort(parent.reason), { once: true })
  return c.signal
}
