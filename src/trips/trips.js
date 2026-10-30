import { makeClient } from '../lib/db.js'
import { listRows, saveRow, pull } from '../lib/repo.js'

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
    const trip = find(await pullImpl(id), id)
    if (trip) {
      addRecent(trip)
      return { trip, source: 'remote' }
    }
  } catch { /* sin red */ }
  return { trip: null, offlineFirstOpen: true }
}
