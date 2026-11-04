import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import marine from './fixtures/marine-sanblas.json'
import weather from './fixtures/weather-sanblas.json'
import { getForecast, cachedForecast, ageLabel, cacheKey, shouldRefresh, REFRESH_HOURS } from '../src/forecast/cache.js'
import { localSet, localDel } from '../src/lib/local.js'

const trip = { lat: -40.5512, lon: -62.2349 }
const NOW = Date.parse('2026-11-08T13:00:00Z')
const copy = (hoursAgo) => ({ fetchedAt: new Date(NOW - hoursAgo * 3.6e6).toISOString(), hours: [], days: {} })

function fakeFetch() {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return new Response(JSON.stringify(url.includes('marine-api') ? marine : weather), { status: 200 })
  }
  return { calls, fetchImpl }
}
const offline = async () => { throw new TypeError('Failed to fetch') }

beforeEach(() => localDel(cacheKey(trip)))

describe('cacheKey', () => {
  it('uses the trip coordinates with 2 decimals', () => {
    expect(cacheKey(trip)).toBe('forecast:-40.55,-62.23')
  })
})

describe('getForecast', () => {
  it('with a 30 min copy does not hit the network', async () => {
    await localSet(cacheKey(trip), copy(0.5))
    const { calls, fetchImpl } = fakeFetch()
    const r = await getForecast(trip, { now: NOW, fetchImpl })
    expect(calls).toHaveLength(0)
    expect(r.refreshed).toBe(false)
    expect(r.ageHours).toBeCloseTo(0.5)
    expect(r.forecast.fetchedAt).toBe(copy(0.5).fetchedAt)
  })

  it('force fetches even with a 30 min copy', async () => {
    await localSet(cacheKey(trip), copy(0.5))
    const { calls, fetchImpl } = fakeFetch()
    const r = await getForecast(trip, { now: NOW, fetchImpl, force: true })
    expect(calls).toHaveLength(2)
    expect(r.refreshed).toBe(true)
    expect(r.ageHours).toBe(0)
  })

  it('force without network keeps the 30 min copy and reports the error', async () => {
    await localSet(cacheKey(trip), copy(0.5))
    const r = await getForecast(trip, { now: NOW, fetchImpl: offline, force: true })
    expect(r.error).toBeTruthy()
    expect(r.forecast.fetchedAt).toBe(copy(0.5).fetchedAt)
  })

  it('with a 2 h copy fetches and stores the new forecast', async () => {
    await localSet(cacheKey(trip), copy(2))
    const { calls, fetchImpl } = fakeFetch()
    const r = await getForecast(trip, { now: NOW, fetchImpl })
    expect(calls).toHaveLength(2)
    expect(r.refreshed).toBe(true)
    expect(r.ageHours).toBe(0)
    expect(r.forecast.hours.length).toBeGreaterThan(0)
    expect((await cachedForecast(trip, NOW)).forecast.hours.length).toBe(r.forecast.hours.length)
  })

  it('with a 2 h copy and no network returns the copy with error', async () => {
    await localSet(cacheKey(trip), copy(2))
    const r = await getForecast(trip, { now: NOW, fetchImpl: offline })
    expect(r.refreshed).toBe(false)
    expect(r.error).toBeTruthy()
    expect(r.ageHours).toBeCloseTo(2)
    expect(r.forecast.fetchedAt).toBe(copy(2).fetchedAt)
  })

  it('without copy and without network returns forecast: null', async () => {
    const r = await getForecast(trip, { now: NOW, fetchImpl: offline })
    expect(r.forecast).toBeNull()
    expect(r.refreshed).toBe(false)
    expect(r.error).toBeTruthy()
  })
})

describe('ageLabel', () => {
  it('over 24 h is amber and says the hours', () => {
    expect(ageLabel(30).amber).toBe(true)
    expect(ageLabel(30).text).toContain('30 h')
  })
  it('under 24 h is not amber', () => {
    expect(ageLabel(3)).toEqual({ text: 'Pronóstico de hace 3 h', amber: false })
    expect(ageLabel(0.25)).toEqual({ text: 'Pronóstico de hace 15 min', amber: false })
  })
})

describe('shouldRefresh (F6)', () => {
  it('refreshes an old or missing forecast, never while a refresh is running', () => {
    expect(shouldRefresh(REFRESH_HOURS + 0.5, false)).toBe(true)
    expect(shouldRefresh(null, false)).toBe(true)
    expect(shouldRefresh(0.2, false)).toBe(false)
    expect(shouldRefresh(REFRESH_HOURS + 0.5, true)).toBe(false)
  })
})
