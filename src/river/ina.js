// Altura del río desde la API pública del INA (a5). Horas en UTC -> hora local del viaje.
import stations from '../data/stations.json'
import { TRIP_OFFSET_MIN, formatLocal } from '../lib/time.js'
import { distanceBearing } from '../map/nav.js'
import { timeoutSignal } from '../lib/timeout.js'
import { FORECAST_TIMEOUT_MS } from '../forecast/fetch.js'
import { STATION_MAX_KM } from '../score/config.js'

const BASE = 'https://alerta.ina.gob.ar/a5'
const local = (iso) => formatLocal(Date.parse(iso) / 60000 + TRIP_OFFSET_MIN)

export function nearestStation(lat, lon, list = stations) {
  let best = null, bestKm = STATION_MAX_KM
  for (const s of list) {
    const { km } = distanceBearing(lat, lon, s.lat, s.lon)
    if (km < bestKm) { best = s; bestKm = km }
  }
  return best
}

export function inaUrls(station, now) {
  const from = new Date(now.getTime() - 7 * 86400000).toISOString()
  return {
    obs: `${BASE}/obs/puntual/series/${station.obsSeries}/observaciones?timestart=${from}&timeend=${now.toISOString()}&format=json`,
    prono: `${BASE}/sim/calibrados/${station.pronoCal}/corridas/last?estacion_id=${station.estacionId}&includeProno=true&format=json`,
  }
}

export function parseLevels(obsJson, pronoJson) {
  const byT = new Map()
  const at = (t) => byT.get(t) ?? byT.set(t, { t, main: null, lo: null, hi: null, meas: null }).get(t)
  for (const r of Array.isArray(obsJson) ? obsJson : obsJson?.rows ?? []) {
    if (r.valor != null) at(local(r.timestart)).meas = r.valor
  }
  for (const r of pronoJson?.series?.[0]?.pronosticos ?? []) {
    const k = { main: 'main', p01: 'lo', p99: 'hi' }[r.qualifier]
    if (k && r.valor != null) at(local(r.timestart))[k] = r.valor
  }
  const rows = [...byT.values()].sort((a, b) => (a.t < b.t ? -1 : 1))
  // [diseño] spec §8.1/§9.1 (12/11): el pronóstico se corre (main, p01, p99) lo que da medido − main en la
  // última hora con los dos, para que la curva no salte al empalmar. Sin hora en común, 0.
  const seam = rows.findLast((r) => r.meas != null && r.main != null)
  const offsetM = seam ? seam.meas - seam.main : 0
  const sh = (v) => (v == null ? null : v + offsetM)
  const points = rows
    .map(({ t, main, lo, hi, meas }) => ({ t, h: meas ?? sh(main), lo: sh(lo), hi: sh(hi), measured: meas != null }))
    .filter((p) => p.h != null)
  return { forecastDate: pronoJson?.forecast_date ?? null, offsetM, points }
}

export async function fetchLevels(station, { fetchImpl = fetch, now = new Date() } = {}) {
  const u = inaUrls(station, now)
  const get = async (url) => {
    const res = await fetchImpl(url, { signal: timeoutSignal(FORECAST_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`INA ${res.status}`)
    return res.json()
  }
  const [o, p] = await Promise.allSettled([get(u.obs), get(u.prono)])
  if (o.status === 'rejected' && p.status === 'rejected') throw o.reason
  const { forecastDate, offsetM, points } = parseLevels(o.value, p.value)
  return { source: `ina:${station.obsSeries}`, stationId: station.id, forecastDate, offsetM, points }
}
