import { localGet, localSet, makeLock } from './local.js'

const KEY = 'queue'
const AUTO_FLUSH_MS = 60_000 // [diseño] spec §3.4
const BACKOFF_BASE_MS = 10_000 // [diseño] 2^n · 10 s ...
const BACKOFF_MAX_MS = 600_000 // [diseño] ... con tope de 10 min

const lock = makeLock()
const listeners = new Set()
const notify = () => listeners.forEach((cb) => cb())

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
export function flush(getClient) {
  return (inflight ??= (async () => {
    let done = 0
    let failed = 0
    const blocked = new Set()
    const clients = new Map()
    for (const op of await pending()) {
      const rowKey = `${op.table}:${op.rowId ?? op.row?.id}`
      if (blocked.has(rowKey) || op.nextTry > Date.now()) {
        if (op.nextTry > Date.now()) blocked.add(rowKey)
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

// Al abrir, al volver la conexión y cada 60 s. getClient(tripId) puede devolver null (op se saltea).
export function startAutoFlush(getClient) {
  const go = () => flush(getClient).catch(() => {})
  go()
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', go)
  const timer = setInterval(go, AUTO_FLUSH_MS)
  return () => {
    window.removeEventListener('online', go)
    clearInterval(timer)
  }
}
