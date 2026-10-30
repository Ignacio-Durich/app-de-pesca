import { localGet, localSet, makeLock } from './local.js'
import { enqueue, pending, requestFlush } from './queue.js'

const lock = makeLock()
const key = (table, scope) => `rows:${table}:${scope}`
// Dueño de la op: spots y sondeos son globales (null); el resto es del viaje (trips: su propio id).
const tripOf = (table, scope) => (table === 'spots' || table === 'soundings' ? null : scope)
const pendingIds = async (table) =>
  (await pending()).filter((o) => o.table === table).map((o) => o.rowId ?? o.row?.id)
const read = async (table, scope) => (await localGet(key(table, scope))) ?? []

// scope = tripId, o 'near:<lat>,<lon>' para spots y sondeos.
export const listRows = read
export const nearScope = (lat, lon) => `near:${lat.toFixed(2)},${lon.toFixed(2)}`

// Aplica local al instante y encola. La op va primero: si se corta entre una y otra,
// la fila sube igual y el próximo pull la trae.
export async function saveRow(table, scope, row, photo) {
  await enqueue({ id: crypto.randomUUID(), table, kind: 'upsert', tripId: tripOf(table, scope), row, ...(photo && { photo }) })
  await lock(async () => {
    const rows = await read(table, scope)
    await localSet(key(table, scope), [...rows.filter((r) => r.id !== row.id), row])
  })
  requestFlush()
}

export async function deleteRow(table, scope, id) {
  await enqueue({ id: crypto.randomUUID(), table, kind: 'delete', tripId: tripOf(table, scope), rowId: id })
  await lock(async () => {
    await localSet(key(table, scope), (await read(table, scope)).filter((r) => r.id !== id))
  })
  requestFlush()
}

// Trae lo del servidor y reemplaza lo local, salvo filas con op pendiente (gana lo local).
// Excepción: respuesta vacía en un scope de viaje (ver abajo).
// Lanza si hay error de red: la pantalla ya muestra lo local y puede ignorarlo.
export async function pull(client, table, scope) {
  // Ids pendientes antes y después del pedido: un flush que termina mientras el select está
  // en vuelo ya no los tiene "después", pero el server pudo responder sin ese cambio.
  const before = await pendingIds(table)
  let q = client.from(table).select('*')
  // trips se filtra por su propio id; el resto de lo del viaje por trip_id.
  if (!scope.startsWith('near:')) q = q.eq(table === 'trips' ? 'id' : 'trip_id', scope)
  // ponytail: spots/sondeos se bajan enteros; el filtro de distancia (SPOTS_RADIUS_KM) es del lado cliente (en la pantalla). Alcanza con pocos datos.
  const { data, error } = await q
  if (error) throw error
  // Un [] del viaje casi siempre es un pedido roto (header/RLS, fila del viaje ausente), no "se borró
  // todo": se deja lo local. Costo aceptado: borrar la última fila desde otro teléfono no se propaga.
  if (!scope.startsWith('near:') && data.length === 0) return read(table, scope)
  return lock(async () => {
    const ids = new Set([...before, ...(await pendingIds(table))])
    const keep = (await read(table, scope)).filter((r) => ids.has(r.id))
    const merged = [...data.filter((r) => !ids.has(r.id)), ...keep]
    await localSet(key(table, scope), merged)
    return merged
  })
}
