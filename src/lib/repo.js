import { localGet, localSet, makeLock } from './local.js'
import { enqueue, pending } from './queue.js'

const lock = makeLock()
const key = (table, scope) => `rows:${table}:${scope}`
const read = async (table, scope) => (await localGet(key(table, scope))) ?? []

// scope = tripId, o 'near:<lat>,<lon>' para spots y sondeos.
export const listRows = read

// Aplica local al instante y encola. La op va primero: si se corta entre una y otra,
// la fila sube igual y el próximo pull la trae.
export async function saveRow(table, scope, row, photo) {
  await enqueue({ id: crypto.randomUUID(), table, kind: 'upsert', row, ...(photo && { photo }) })
  await lock(async () => {
    const rows = await read(table, scope)
    await localSet(key(table, scope), [...rows.filter((r) => r.id !== row.id), row])
  })
}

export async function deleteRow(table, scope, id) {
  await enqueue({ id: crypto.randomUUID(), table, kind: 'delete', rowId: id })
  await lock(async () => {
    await localSet(key(table, scope), (await read(table, scope)).filter((r) => r.id !== id))
  })
}

// Trae lo del servidor y reemplaza lo local, salvo filas con op pendiente (gana lo local).
// Lanza si hay error de red: la pantalla ya muestra lo local y puede ignorarlo.
export async function pull(client, table, scope) {
  let q = client.from(table).select('*')
  // trips se filtra por su propio id; el resto de lo del viaje por trip_id.
  if (!scope.startsWith('near:')) q = q.eq(table === 'trips' ? 'id' : 'trip_id', scope)
  // ponytail: spots/sondeos se bajan enteros; el filtro de 50 km es del lado cliente (en la pantalla). Alcanza con pocos datos.
  const { data, error } = await q
  if (error) throw error
  return lock(async () => {
    const ids = new Set((await pending()).filter((o) => o.table === table).map((o) => o.rowId ?? o.row?.id))
    const keep = (await read(table, scope)).filter((r) => ids.has(r.id))
    const merged = [...data.filter((r) => !ids.has(r.id)), ...keep]
    await localSet(key(table, scope), merged)
    return merged
  })
}
