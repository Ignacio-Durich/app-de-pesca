import { describe, it, expect } from 'vitest'
import marine from './fixtures/marine-sanblas.json'
import weather from './fixtures/weather-sanblas.json'
import { buildUrls, normalize, fetchForecast, MODELS } from '../src/forecast/fetch.js'

const FETCHED = '2026-10-29T12:00:00.000Z'
const f = normalize(marine, weather, FETCHED)
const at = (t) => f.hours.find((h) => h.t === t)

describe('buildUrls', () => {
  const { marine: m, weather: w } = buildUrls(-40.55, -62.23)
  it('weather asks for the 3 models and daily sun', () => {
    expect(w).toContain('models=ecmwf_ifs025,gfs_seamless,icon_seamless')
    expect(w).toContain('daily=sunrise,sunset')
    expect(w).toContain('latitude=-40.55')
    expect(w).toContain('longitude=-62.23')
  })
  it('marine uses sea cells', () => {
    expect(m).toContain('cell_selection=sea')
    expect(m).toContain('hourly=sea_level_height_msl,wave_height,sea_surface_temperature')
  })
  it('both use past_days, forecast_days and local timezone', () => {
    for (const u of [m, w]) {
      expect(u).toContain('past_days=1&forecast_days=16')
      expect(u).toContain('timezone=America/Argentina/Buenos_Aires')
    }
  })
  it('MODELS maps short keys', () => {
    expect(MODELS).toEqual({ ecmwf: 'ecmwf_ifs025', gfs: 'gfs_seamless', icon: 'icon_seamless' })
  })
})

describe('normalize', () => {
  it('header fields come from the weather response', () => {
    expect(f.fetchedAt).toBe(FETCHED)
    expect(f.utcOffsetSeconds).toBe(weather.utc_offset_seconds)
    expect(f.lat).toBe(weather.latitude)
    expect(f.lon).toBe(weather.longitude)
  })
  it('hours is the sorted union of both timestamp sets', () => {
    expect(f.hours).toHaveLength(96)
    expect(f.hours[0].t).toBe('2026-11-06T00:00')
    expect(f.hours.at(-1).t).toBe('2026-11-09T23:00')
    expect(f.hours.map((h) => h.t)).toEqual([...f.hours.map((h) => h.t)].sort())
  })
  it('wind.icon is built from wind_speed_10m_icon_seamless', () => {
    const i = weather.hourly.time.indexOf('2026-11-07T12:00')
    expect(at('2026-11-07T12:00').wind.icon).toBe(weather.hourly.wind_speed_10m_icon_seamless[i])
    expect(at('2026-11-07T12:00').wind.ecmwf).toBe(weather.hourly.wind_speed_10m_ecmwf_ifs025[i])
    expect(at('2026-11-07T12:00').gust.gfs).toBe(weather.hourly.wind_gusts_10m_gfs_seamless[i])
  })
  it('maps every per-model field with the 3 keys', () => {
    const h = at('2026-11-07T12:00')
    for (const k of ['wind', 'gust', 'dir', 'rain', 'temp', 'pressure'])
      expect(Object.keys(h[k])).toEqual(['ecmwf', 'gfs', 'icon'])
  })
  it('marine values land on their hour; missing ones are null', () => {
    const i = marine.hourly.time.indexOf('2026-11-07T12:00')
    expect(at('2026-11-07T12:00').sea).toBe(marine.hourly.sea_level_height_msl[i])
    expect(at('2026-11-07T12:00').wave).toBe(marine.hourly.wave_height[i])
    expect(at('2026-11-07T12:00').sst).toBe(marine.hourly.sea_surface_temperature[i])
    expect(at('2026-11-09T12:00').sea).toBeNull()
  })
  it('hours past the model horizon have null, not undefined', () => {
    expect(at('2026-11-07T12:00').wind.icon).toBeNull()
  })
  it('sunrise/sunset come from the first model with data', () => {
    const i = weather.daily.time.indexOf('2026-11-08')
    expect(f.days['2026-11-08'].sunrise).toBe(weather.daily.sunrise_ecmwf_ifs025[i])
    expect(f.days['2026-11-08'].sunset).toBe(weather.daily.sunset_ecmwf_ifs025[i])
    expect(f.days['2026-11-08'].sunrise).toMatch(/^2026-11-08T\d\d:\d\d$/)
  })
  it('sunrise falls back to the next model when ecmwf is null', () => {
    const w2 = structuredClone(weather)
    const i = w2.daily.time.indexOf('2026-11-08')
    w2.daily.sunrise_ecmwf_ifs025[i] = null
    expect(normalize(marine, w2, FETCHED).days['2026-11-08'].sunrise).toBe(
      weather.daily.sunrise_gfs_seamless[i],
    )
  })
  it('lastTideT is the last t with sea != null', () => {
    const i = marine.hourly.sea_level_height_msl.findLastIndex((v) => v != null)
    expect(f.lastTideT).toBe(marine.hourly.time[i])
    expect(f.lastTideT).toBe('2026-11-07T20:00')
  })
  it('lastWindT is the last t where any model has wind', () => {
    expect(f.lastWindT).toBe('2026-11-09T23:00')
    const w2 = structuredClone(weather)
    for (const m of Object.values(MODELS))
      w2.hourly[`wind_speed_10m_${m}`] = w2.hourly[`wind_speed_10m_${m}`].map((v, i) => (i > 10 ? null : v))
    expect(normalize(marine, w2, FETCHED).lastWindT).toBe(weather.hourly.time[10])
  })
  it('lastTideT/lastWindT are null when there is no data', () => {
    const empty = { hourly: { time: [] }, daily: { time: [] } }
    const n = normalize(empty, empty, FETCHED)
    expect(n.lastTideT).toBeNull()
    expect(n.lastWindT).toBeNull()
  })
})

describe('fetchForecast', () => {
  const ok = (body) => ({ ok: true, status: 200, json: async () => body })
  it('fetches both urls and normalizes', async () => {
    const urls = []
    const fake = async (u) => (urls.push(u), ok(u.includes('marine-api') ? marine : weather))
    const r = await fetchForecast(-40.55, -62.23, fake)
    expect(urls).toHaveLength(2)
    expect(r.hours).toHaveLength(96)
    expect(new Date(r.fetchedAt).toISOString()).toBe(r.fetchedAt)
  })
  it('propagates a rejecting fetch', async () => {
    await expect(fetchForecast(0, 0, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')
  })
  it('throws on non-ok status including the status', async () => {
    const fake = async () => ({ ok: false, status: 429, json: async () => ({}) })
    await expect(fetchForecast(0, 0, fake)).rejects.toThrow(/429/)
  })
})
