import { makeClient } from '../lib/db.js'
import { listRows, saveRow, pull } from '../lib/repo.js'
import { withTimeout } from '../lib/timeout.js'

// [diseño] primera apertura: si el viaje no llega en este tiempo, se trata como sin señal.
export const LOAD_TIMEOUT_MS = 10_000

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* modo privado o sin espacio */ }
}

// Quién soy en este teléfono, por viaje (spec §2.1).
export const getMe = (tripId) => read(`me:${tripId}`, null)
export const setMe = (tripId, name) => write(`me:${tripId}`, name)

export const recentTrips = () => read('recentTrips', [])

// El id del viaje dentro de un link pegado (o el id solo). En el iPhone la app instalada no ve lo de
// Safari ni tiene barra de direcciones: se entra pegando el link.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
export const tripIdFrom = (text) => text.match(UUID_RE)?.[0].toLowerCase() ?? null
const addRecent = ({ id, name }) => write('recentTrips', [{ id, name }, ...recentTrips().filter((t) => t.id !== id)])

// Offline primero: guarda local y encola; la cola lo sube con el header del propio viaje.
export async function createTrip({ name, placeName, lat, lon, startDate, endDate, members, water = 'mar', nightFishing = false }) {
  const id = crypto.randomUUID()
  await saveRow('trips', id, {
    id, name, place_name: placeName, lat, lon, start_date: startDate, end_date: endDate,
    members, water, night_fishing: nightFishing,
  })
  addRecent({ id, name })
  return id
}

const defaultPull = (id) => pull(makeClient(id), 'trips', id)
const find = (rows, id) => rows.find((r) => r.id === id) ?? null

// Con copia local responde ya (y refresca en segundo plano: `refresh` se puede ignorar).
// Sin copia intenta bajarlo; si no hay red o no existe, es la primera apertura sin señal.
export async function loadTrip(id, { pullImpl = defaultPull } = {}) {
  const local = find(await listRows('trips', id), id)
  if (local) {
    const refresh = Promise.resolve().then(() => pullImpl(id)).catch(() => {})
    return { trip: local, source: 'local', refresh }
  }
  try {
    const trip = find(await withTimeout(pullImpl(id), LOAD_TIMEOUT_MS), id)
    if (trip) {
      addRecent(trip)
      return { trip, source: 'remote' }
    }
  } catch { /* sin red */ }
  return { trip: null, offlineFirstOpen: true }
}
