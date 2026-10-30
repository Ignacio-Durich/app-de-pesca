import { describe, it, expect } from 'vitest'
import { prepareTrip, needsReminder, zoneChanged, depthTiles, satTiles, satMinutes } from '../src/prepare/prepare.js'
import regions from '../src/data/regions.json'

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
    sat: [],
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

  it('a tile that always fails is skipped: the rest still get cached and only it is retried', async () => {
    const d = deps()
    const BAD = '/12/1003/2000.png'
    const first = recorder((u) => u.endsWith(BAD))
    const s1 = await prepareTrip(trip, { ...d, fetch: first.fetchImpl })
    expect(s1.depth).toEqual({ done: 9, total: 10 })
    expect(s1.missing.join(' ')).toMatch(/Profundidad: 9 de 10 teselas, 1 con error/)
    expect(d.caches.stores.get('depth-v1').size).toBe(9)

    const again = recorder((u) => u.endsWith(BAD))
    await prepareTrip(trip, { ...d, fetch: again.fetchImpl })
    expect(again.calls.filter(isDepth).map((u) => u.slice(-BAD.length))).toEqual([BAD])
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
    // el archivo completo: del tamaño que dice regions.json
    const fetch = (u) => (u.endsWith('.pmtiles') ? (r1.calls.push(u), Promise.resolve(new Response(new Uint8Array(regions[0].bytes)))) : r1.fetchImpl(u))
    const s = await prepareTrip(trip, { ...d, fetch })
    expect(r1.calls).toContain('https://maps.test/san-blas.pmtiles')
    expect(d.store.get('region:san-blas')).toBeInstanceOf(Blob)
    expect(s.regionAt).toBe('2026-11-05T11:30:00.000Z')
    const r2 = recorder()
    await prepareTrip(trip, { ...d, fetch: r2.fetchImpl })
    expect(r2.calls.some((u) => u.endsWith('.pmtiles'))).toBe(false)
  })

  it('downloads the region again when the stored file is not the size regions.json says (map was updated)', async () => {
    const d = deps({ mapBaseUrl: 'https://maps.test' })
    d.store.set('region:san-blas', new Blob(['mapa viejo']))
    const r = recorder()
    await prepareTrip(trip, { ...d, fetch: r.fetchImpl })
    expect(r.calls).toContain('https://maps.test/san-blas.pmtiles')
  })

  it('saves the satellite tiles in sat-v1 and lists the missing ones', async () => {
    const SAT = [{ z: 13, x: 2681, y: 5086 }, { z: 13, x: 2682, y: 5086 }]
    const d = deps({ sat: SAT })
    const r = recorder((u) => u.includes('/13/5086/2682.jpg'))
    const s = await prepareTrip(trip, { ...d, fetch: r.fetchImpl })
    expect(r.calls).toContain('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/13/5086/2681.jpg')
    expect(s.sat).toEqual({ done: 1, total: 2 })
    expect(s.missing.join(' ')).toMatch(/Satélite: 1 de 2 teselas, 1 con error/)
  })

  it('skips the satellite when the person chose not to download it', async () => {
    const SAT = [{ z: 13, x: 2681, y: 5086 }]
    const d = deps({ sat: SAT })
    const r = recorder()
    const s = await prepareTrip(trip, { ...d, fetch: r.fetchImpl, withSat: false })
    expect(r.calls.filter((u) => u.includes('eox.at'))).toEqual([])
    expect(s.sat).toBeNull()
    expect(s.missing.join(' ')).not.toMatch(/Satélite/)
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

describe('zoneChanged', () => {
  const trip = { lat: -40.55, lon: -62.23 }
  const full = { depth: { total: depthTiles(trip).length }, sat: { total: satTiles(trip).length } }
  it('is false when the saved counts match the current zone', () => {
    expect(zoneChanged(trip, full)).toBe(false)
  })
  it('is true for a status saved with the old 80 km zone (60 depth tiles, no satellite)', () => {
    expect(zoneChanged(trip, { depth: { total: 60 } })).toBe(true)
  })
  it('is false when the satellite was skipped on purpose', () => {
    expect(zoneChanged(trip, { ...full, sat: null })).toBe(false)
  })
  it('is false before the first preparation', () => {
    expect(zoneChanged(trip, null)).toBe(false)
  })
})

describe('satMinutes', () => {
  it('estimates whole minutes at the measured 20 tiles per second', () => {
    expect(satMinutes(24688)).toBe(21)
    expect(satMinutes(100)).toBe(1)
  })
})
