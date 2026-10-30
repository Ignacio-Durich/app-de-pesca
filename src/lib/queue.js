import { localGet, localSet, makeLock } from './local.js'

const KEY = 'queue'
const AUTO_FLUSH_MS = 60_000 // [diseño] spec §3.4
const BACKOFF_BASE_MS = 10_000 // [diseño] 2^n · 10 s ...
const BACKOFF_MAX_MS = 600_000 // [diseño] ... con tope de 10 min

const lock = makeLock()
const listeners = new Set()
// Un listener que tira no debe hacer fallar enqueue: la op ya quedó guardada y reintentar la duplicaría.
const notify = () => listeners.forEach((cb) => { try { cb() } catch { /* problema del listener */ } })

// Avisa cuando cambia la cola (para el contador "N pendientes"). Devuelve la baja.
export function onQueueChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const pending = async () => (await localGet(KEY)) ?? []

// Lectura-modificación-escritura de la cola, de a una.
const update = (fn) =>
  lock(async () => {
    await localSet(KEY, fn(await pending()))
    notify()
  })

// op: {id, table, kind: 'upsert'|'delete', tripId, row?, rowId?, photo?: {path, blob}}
// tripId: el viaje dueño de la op (header x-trip-id al subirla); null para spots/sondeos.
export const enqueue = (op) => update((q) => [...q, { tries: 0, nextTry: 0, tripId: null, ...op }])

const isDuplicate = (e) =>
  e && (e.status == 409 || e.statusCode == 409 || /duplicate|already exists/i.test(e.message ?? ''))

// Foto primero, fila después. Todo es idempotente: reintentar manda el mismo id.
async function run(client, op) {
  if (op.photo) {
    const { error } = await client.storage
      .from('catch-photos')
      .upload(op.photo.path, op.photo.blob, { contentType: 'image/jpeg' })
    if (error && !isDuplicate(error)) throw error
  }
  const t = client.from(op.table)
  const { error } = op.kind === 'delete' ? await t.delete().eq('id', op.rowId) : await t.upsert(op.row)
  if (error) throw error
}

let inflight = null

// Procesa la cola en orden. Una op que falla se saltea (backoff) y las siguientes siguen,
// salvo las de la misma fila, que esperan para no aplicarse fuera de orden. Nunca descarta.
// getClient(tripId) -> client: cada op sube con el cliente (x-trip-id) de su propio viaje.
// force: ignora el backoff (al abrir la app y al volver la señal no tiene sentido esperar).
export function flush(getClient, { force = false } = {}) {
  return (inflight ??= (async () => {
    let done = 0
    let failed = 0
    const blocked = new Set()
    const clients = new Map()
    for (const op of await pending()) {
      const rowKey = `${op.table}:${op.rowId ?? op.row?.id}`
      const waiting = !force && op.nextTry > Date.now()
      if (blocked.has(rowKey) || waiting) {
        if (waiting) blocked.add(rowKey)
        continue
      }
      if (!clients.has(op.tripId)) clients.set(op.tripId, getClient(op.tripId))
      const client = clients.get(op.tripId)
      if (!client) {
        blocked.add(rowKey) // sin cliente para ese viaje todavía: espera, sin castigo
        continue
      }
      try {
        await run(client, op)
        await update((q) => q.filter((o) => o.id !== op.id))
        done++
      } catch {
        const tries = op.tries + 1
        const nextTry = Date.now() + Math.min(2 ** op.tries * BACKOFF_BASE_MS, BACKOFF_MAX_MS)
        await update((q) => q.map((o) => (o.id === op.id ? { ...o, tries, nextTry } : o)))
        blocked.add(rowKey)
        failed++
      }
    }
    return { done, failed }
  })().finally(() => (inflight = null)))
}

let flushClient = null

// Tras una escritura local: sube ya (sin esperar los 60 s) si hay señal. Sin esperar el resultado.
// Si hay un flush en curso, otro detrás: el que corre ya tomó su lista antes de esta escritura.
const offline = () => globalThis.navigator?.onLine === false

export function requestFlush() {
  if (!flushClient || offline()) return
  const go = () => flush(flushClient).catch(() => {})
  inflight ? inflight.then(go, go) : go()
}

// Al abrir (y al volver a la app), al volver la conexión y cada 60 s. getClient(tripId) puede
// devolver null (op se saltea). Sin señal no se intenta: no gasta intentos ni infla el backoff.
export function startAutoFlush(getClient) {
  flushClient = getClient
  const go = (force) => offline() || flush(getClient, { force }).catch(() => {})
  const now = () => go(true)
  const tick = () => go(false)
  const onVisible = () => document.visibilityState === 'visible' && now()
  now()
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', now)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(tick, AUTO_FLUSH_MS)
  return () => {
    window.removeEventListener('online', now)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}
