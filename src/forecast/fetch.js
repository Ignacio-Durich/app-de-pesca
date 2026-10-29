// Descarga y normaliza Open-Meteo: marea/oleaje (marine) + viento/clima de 3 modelos.
// Las horas vienen en hora local del lugar como texto sin offset; no se parsean acá.
export const MODELS = { ecmwf: 'ecmwf_ifs025', gfs: 'gfs_seamless', icon: 'icon_seamless' }

const TZ = 'America/Argentina/Buenos_Aires'
const COMMON = `past_days=1&forecast_days=16&timezone=${TZ}`

export const buildUrls = (lat, lon) => ({
  marine:
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=sea_level_height_msl,wave_height,sea_surface_temperature&cell_selection=sea&${COMMON}`,
  weather:
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,temperature_2m,surface_pressure` +
    `&daily=sunrise,sunset&models=${Object.values(MODELS).join(',')}&${COMMON}`,
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
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`)
  return res.json()
}

export async function fetchForecast(lat, lon, fetchImpl = fetch) {
  const u = buildUrls(lat, lon)
  const [marine, weather] = await Promise.all([getJson(fetchImpl, u.marine), getJson(fetchImpl, u.weather)])
  return normalize(marine, weather, new Date().toISOString())
}
