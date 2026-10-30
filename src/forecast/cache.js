import { fetchForecast } from './fetch.js'
import { localGet, localSet } from '../lib/local.js'

export const REFRESH_HOURS = 1 // [diseño] spec §3.4: con señal se refresca si tiene más de 1 h
export const STALE_HOURS = 24 // [diseño] spec §3.4: más de 24 h se pone en ámbar

export const cacheKey = (trip) => `forecast:${trip.lat.toFixed(2)},${trip.lon.toFixed(2)}`

export const ageOf = (f, now) => (f ? Math.max(0, (now - Date.parse(f.fetchedAt)) / 3.6e6) : null)

// Refrescar en pantalla (al volver a la app y cada tanto): copia vieja o ninguna, y sin otro pedido en curso.
// Mismo borde que getForecast: con menos de REFRESH_HOURS devolvería la copia sin pedir nada.
export const shouldRefresh = (ageHours, loading) => !loading && (ageHours == null || ageHours >= REFRESH_HOURS)

// Solo lo local, al instante: la pantalla se dibuja con esto antes de tocar la red.
export async function cachedForecast(trip, now = Date.now()) {
  const forecast = (await localGet(cacheKey(trip))) ?? null
  return { forecast, ageHours: ageOf(forecast, now), refreshed: false }
}

// Lo local si tiene menos de REFRESH_HOURS; si no, intenta bajarlo. Sin red: la copia con `error`.
export async function getForecast(trip, { now = Date.now(), fetchImpl = fetch } = {}) {
  const local = await cachedForecast(trip, now)
  if (local.forecast && local.ageHours < REFRESH_HOURS) return local
  try {
    const forecast = await fetchForecast(trip.lat, trip.lon, fetchImpl)
    await localSet(cacheKey(trip), forecast)
    return { forecast, ageHours: 0, refreshed: true }
  } catch (e) {
    return { ...local, error: e.message || String(e) }
  }
}

export function ageLabel(ageHours) {
  const h = Math.round(ageHours)
  if (ageHours > STALE_HOURS) return { text: `El pronóstico tiene ${h} h, puede haber cambiado`, amber: true }
  return { text: ageHours < 1 ? `Pronóstico de hace ${Math.round(ageHours * 60)} min` : `Pronóstico de hace ${h} h`, amber: false }
}
