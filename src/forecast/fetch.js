// Descarga y normaliza Open-Meteo: marea/oleaje (marine) + viento/clima de 3 modelos.
// Las horas vienen en hora local del lugar como texto sin offset; no se parsean acá.
import { timeoutSignal } from '../lib/timeout.js'
import { fetchLevels } from '../river/ina.js'

export const MODELS = { ecmwf: 'ecmwf_ifs025', gfs: 'gfs_seamless', icon: 'icon_seamless' }

// [diseño] tiempo máximo por pedido a Open-Meteo: sin esto, "Descargando pronóstico…" puede quedar para siempre.
export const FORECAST_TIMEOUT_MS = 20_000

const TZ = 'America/Argentina/Buenos_Aires'
const common = (past) => `past_days=${past}&forecast_days=16&timezone=${TZ}`

// En río no hay marea: sin marine, y 5 días atrás de clima para la temperatura estimada (spec §8.3).
export const buildUrls = (lat, lon, { water = 'mar' } = {}) => ({
  marine:
    water === 'rio'
      ? null
      : `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
        `&hourly=sea_level_height_msl,wave_height,sea_surface_temperature&cell_selection=sea&${common(1)}`,
  weather:
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,temperature_2m,surface_pressure` +
    `&daily=sunrise,sunset&models=${Object.values(MODELS).join(',')}&${common(water === 'rio' ? 5 : 1)}`,
})

// campo del forecast -> variable de Open-Meteo
const FIELDS = {
  wind: 'wind_speed_10m',
  gust: 'wind_gusts_10m',
  dir: 'wind_direction_10m',
  rain: 'precipitation_probability',
  temp: 'temperature_2m',
  pressure: 'surface_pressure',
}

// ponytail: índice por timestamp con Map; suficiente para ~400 horas.
const indexOf = (times = []) => new Map(times.map((t, i) => [t, i]))

export function normalize(marine, weather, fetchedAt) {
  const mh = marine.hourly ?? { time: [] }
  const wh = weather.hourly ?? { time: [] }
  const mi = indexOf(mh.time)
  const wi = indexOf(wh.time)
  // Texto ISO de formato fijo: el orden lexicográfico es el cronológico.
  const times = [...new Set([...mh.time, ...wh.time])].sort()
  const m = (key, t) => mh[key]?.[mi.get(t)] ?? null
  const w = (key, model, t) => wh[`${key}_${model}`]?.[wi.get(t)] ?? null

  const hours = times.map((t) => {
    const h = {
      t,
      sea: m('sea_level_height_msl', t),
      wave: m('wave_height', t),
      sst: m('sea_surface_temperature', t),
    }
    for (const [field, key] of Object.entries(FIELDS))
      h[field] = Object.fromEntries(Object.entries(MODELS).map(([k, model]) => [k, w(key, model, t)]))
    return h
  })

  const wd = weather.daily ?? { time: [] }
  const days = {}
  wd.time.forEach((date, i) => {
    const first = (key) => {
      for (const model of Object.values(MODELS)) {
        const v = wd[`${key}_${model}`]?.[i]
        if (v != null) return v
      }
      return null
    }
    days[date] = { sunrise: first('sunrise'), sunset: first('sunset') }
  })

  const last = (pred) => hours.findLast(pred)?.t ?? null
  return {
    fetchedAt,
    utcOffsetSeconds: weather.utc_offset_seconds,
    lat: weather.latitude,
    lon: weather.longitude,
    hours,
    days,
    lastTideT: last((h) => h.sea != null),
    lastWindT: last((h) => Object.values(h.wind).some((v) => v != null)),
  }
}

const getJson = async (fetchImpl, url) => {
  const res = await fetchImpl(url, { signal: timeoutSignal(FORECAST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`)
  return res.json()
}

// La altura del río ocupa el lugar del nivel del mar (`sea`), así curva, extremos y puntaje siguen igual.
export function withLevels(forecast, levels) {
  const h = new Map(levels.points.map((p) => [p.t, p.h]))
  const hours = forecast.hours.map((x) => ({ ...x, sea: h.get(x.t) ?? null }))
  const { source, stationId, forecastDate, offsetM, points } = levels
  return { ...forecast, hours, level: { source, stationId, forecastDate, offsetM, points }, lastTideT: hours.findLast((x) => x.sea != null)?.t ?? null }
}

export async function fetchForecast(lat, lon, fetchImpl = fetch, { water = 'mar', station = null } = {}) {
  const u = buildUrls(lat, lon, { water })
  if (water !== 'rio') {
    const [marine, weather] = await Promise.all([getJson(fetchImpl, u.marine), getJson(fetchImpl, u.weather)])
    return normalize(marine, weather, new Date().toISOString())
  }
  // Río: si el INA falla (o no hay estación cerca) queda el clima solo.
  const [weather, lv] = await Promise.all([
    getJson(fetchImpl, u.weather),
    station ? fetchLevels(station, { fetchImpl }).then((v) => ({ v }), (e) => ({ e })) : {},
  ])
  const base = normalize({ hourly: { time: [] } }, weather, new Date().toISOString())
  if (lv.v) return withLevels(base, lv.v)
  return lv.e ? { ...base, levelError: lv.e.message || String(lv.e) } : base
}
