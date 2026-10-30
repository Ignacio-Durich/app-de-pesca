import { describe, it, expect } from 'vitest'
import { prepareTrip, needsReminder } from '../src/prepare/prepare.js'

const trip = { id: 't1', lat: -40.5512, lon: -62.2349, start_date: '2026-11-07', end_date: '2026-11-08' }
const TILES = Array.from({ length: 10 }, (_, i) => ({ z: 12, x: 1000 + i, y: 2000 }))
const isDepth = (u) => u.includes('/terrarium/')
const PHOTO = (p) => `https://x.test/storage/v1/object/public/catch-photos/${p}`

// Cache API en memoria: alcanza con open/match/put.
function fakeCaches() {
  const stores = new Map()
  return {
    stores,
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const m = stores.get(name)
      return { match: async (u) => m.get(u), put: async (u, r) => void m.set(u, r) }
    },
  }
}
function recorder(failWhen = () => false) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (failWhen(url, calls)) throw new TypeError('Failed to fetch')
    return new Response('bytes', { status: 200 })
  }
  return { calls, fetchImpl }
}
function deps(extra = {}) {
  const store = new Map()
  return {
    store,
    caches: fakeCaches(),
    get: async (k) => store.get(k),
    set: async (k, v) => void store.set(k, v),
    getForecast: async () => ({ forecast: { fetchedAt: '2026-11-05T11:00:00.000Z' }, ageHours: 0 }),
    pull: async (table) => (table === 'catches' ? [{ id: 'c1', photo_path: 't1/c1.jpg' }, { id: 'c2', photo_path: null }] : []),
    photoUrl: PHOTO,
    tiles: TILES,
    mapBaseUrl: '',
    now: () => Date.parse('2026-11-05T11:30:00Z'),
    ...extra,
  }
}

describe('prepareTrip', () => {
  it('resumes a cut download: relaunching only fetches the missing tiles (Review Focus 4)', async () => {
    const d = deps()
    let depthCalls = 0
    const cut = recorder((u) => isDepth(u) && ++depthCalls > 5)
    const first = await prepareTrip(trip, { ...d, fetch: cut.fetchImpl })
    expect(first.depth).toEqual({ done: 5, total: 10 })
    expect(first.missing.join(' ')).toMatch(/Profundidad: 5 de 10/)

    const again = recorder()
    const second = await prepareTrip(trip, { ...d, fetch: again.fetchImpl })
    const depthUrls = again.calls.filter(isDepth)
    expect(depthUrls).toHaveLength(5)
    expect(depthUrls[0]).toBe('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1005/2000.png')
    expect(second.depth).toEqual({ done: 10, total: 10 })
    expect(second.missing).toEqual([])
    expect(d.store.get('prepare:t1')).toEqual(second)
  })

  it('without VITE_MAP_BASE_URL skips the base map with a note and does the rest', async () => {
    const d = deps()
    const r = recorder()
    const s = await prepareTrip(trip, { ...d, fetch: r.fetchImpl })
    expect(s.regionAt).toBeNull()
    expect(s.regionNote).toBe('Mapa base todavía no configurado')
    expect(s.forecastAt).toBe('2026-11-05T11:00:00.000Z')
    expect(s.dataAt).toBe('2026-11-05T11:30:00.000Z')
    expect(r.calls.some((u) => u.endsWith('.pmtiles'))).toBe(false)
  })

  it('downloads the region once and keeps it in region:<id>', async () => {
    const d = deps({ mapBaseUrl: 'https://maps.test' })
    const r1 = recorder()
    const s = await prepareTrip(trip, { ...d, fetch: r1.fetchImpl })
    expect(r1.calls).toContain('https://maps.test/san-blas.pmtiles')
    expect(d.store.get('region:san-blas')).toBeInstanceOf(Blob)
    expect(s.regionAt).toBe('2026-11-05T11:30:00.000Z')
    const r2 = recorder()
    await prepareTrip(trip, { ...d, fetch: r2.fetchImpl })
    expect(r2.calls.some((u) => u.endsWith('.pmtiles'))).toBe(false)
  })

  it('caches each catch photo once and skips failures', async () => {
    const d = deps()
    const bad = recorder((u) => u.includes('catch-photos'))
    const s1 = await prepareTrip(trip, { ...d, fetch: bad.fetchImpl })
    expect(s1.photos).toEqual({ done: 0, total: 1 })
    const ok = recorder()
    const s2 = await prepareTrip(trip, { ...d, fetch: ok.fetchImpl })
    expect(s2.photos).toEqual({ done: 1, total: 1 })
    const again = recorder()
    await prepareTrip(trip, { ...d, fetch: again.fetchImpl })
    expect(again.calls.filter((u) => u.includes('catch-photos'))).toEqual([])
  })

  it('a failed pull leaves dataAt as it was and lists what is missing', async () => {
    const d = deps({ pull: async () => { throw new TypeError('Failed to fetch') } })
    const s = await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl })
    expect(s.dataAt).toBeNull()
    expect(s.missing.join(' ')).toMatch(/Datos del viaje/)
  })
})

describe('needsReminder', () => {
  // Hora local del viaje (Argentina, UTC−3). Viaje desde el 7/11 00:00.
  const at = (hoursAgoFromLocal) => new Date(Date.parse(hoursAgoFromLocal + ':00-03:00')).toISOString()

  it('40 h before the trip with a 13 h old forecast → true', () => {
    expect(needsReminder(trip, { forecastAt: at('2026-11-04T19:00') }, '2026-11-05T08:00')).toBe(true)
  })
  it('40 h before the trip with a 2 h old forecast → false', () => {
    expect(needsReminder(trip, { forecastAt: at('2026-11-05T06:00') }, '2026-11-05T08:00')).toBe(false)
  })
  it('never prepared → true', () => {
    expect(needsReminder(trip, null, '2026-11-05T08:00')).toBe(true)
  })
  it('72 h before the trip → false', () => {
    expect(needsReminder(trip, { forecastAt: at('2026-11-03T11:00') }, '2026-11-04T00:00')).toBe(false)
  })
  it('after the trip ended → false', () => {
    expect(needsReminder(trip, null, '2026-11-09T00:00')).toBe(false)
  })
})
