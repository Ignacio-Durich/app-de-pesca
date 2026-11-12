import { describe, it, expect } from 'vitest'
import { prepareTrip, needsReminder, zoneChanged, isReady, needsSatMove, needsResume, statusKey, depthTiles, satTiles, satTime, satMissing } from '../src/prepare/prepare.js'
import regions from '../src/data/regions.json'
import { tilesInRadius } from '../src/map/tiles.js'

const trip = { id: 't1', lat: -40.5512, lon: -62.2349, start_date: '2026-11-07', end_date: '2026-11-08' }
const TILES = Array.from({ length: 10 }, (_, i) => ({ z: 12, x: 1000 + i, y: 2000 }))
const isDepth = (u) => u.includes('/terrarium/')
const PHOTO = (p) => `https://x.test/storage/v1/object/public/catch-photos/${p}`

// Cache API en memoria: alcanza con has/delete/open/match/put.
function fakeCaches() {
  const stores = new Map()
  return {
    stores,
    has: async (name) => stores.has(name),
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const m = stores.get(name)
      return { match: async (u) => m.get(u), put: async (u, r) => void m.set(u, r) }
    },
  }
}
// La base de IndexedDB del satélite (src/map/satStore.js) en memoria.
function fakeSatStore() {
  const tiles = new Map()
  return { tiles, match: async (u) => tiles.get(u), put: async (u, r) => void tiles.set(u, await r.text()) }
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
    satStore: fakeSatStore(),
    get: async (k) => store.get(k),
    set: async (k, v) => void store.set(k, structuredClone(v)), // copia, como IndexedDB
    getForecast: async () => ({ forecast: { fetchedAt: '2026-11-05T11:00:00.000Z' }, ageHours: 0 }),
    pull: async (table) => (table === 'catches' ? [{ id: 'c1', photo_path: 't1/c1.jpg' }, { id: 'c2', photo_path: null }] : []),
    pullCatchesNear: async () => [],
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

  it('saves the satellite tiles in IndexedDB, not in the Cache API, and lists the missing ones', async () => {
    const SAT = [{ z: 13, x: 2681, y: 5086 }, { z: 13, x: 2682, y: 5086 }]
    const d = deps({ sat: SAT })
    const r = recorder((u) => u.includes('/13/5086/2682.jpg'))
    const s = await prepareTrip(trip, { ...d, fetch: r.fetchImpl })
    expect(r.calls).toContain('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/13/5086/2681.jpg')
    expect(s.sat).toEqual({ done: 1, total: 2 })
    expect(s.missing.join(' ')).toMatch(/Satélite: 1 de 2 teselas, 1 con error/)
    expect(d.satStore.tiles.size).toBe(1)
    expect(d.caches.stores.has('sat-v1')).toBe(false)
  })

  const manySat = (n) => Array.from({ length: n }, (_, i) => ({ z: 13, x: 3000 + i, y: 5086 }))

  const satUrl = (x) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/13/5086/${x}.jpg`

  it('copies what is in the old sat-v1 without downloading it, then deletes that cache', async () => {
    const d = deps({ sat: [{ z: 13, x: 1, y: 5086 }, { z: 13, x: 2, y: 5086 }] })
    const old = await d.caches.open('sat-v1')
    await old.put(satUrl(1), new Response('viejo'))
    const r = recorder()
    const s = await prepareTrip(trip, { ...d, fetch: r.fetchImpl })
    expect(r.calls.filter((u) => u.includes('eox.at'))).toEqual([satUrl(2)])
    expect(d.satStore.tiles.get(satUrl(1))).toBe('viejo')
    expect(s.sat).toEqual({ done: 2, total: 2 })
    expect(s.satDb).toBe(true)
    expect(d.caches.stores.has('sat-v1')).toBe(false)
  })

  it('a cut copy keeps the old sat-v1 and picks up where it stopped', async () => {
    const d = deps({ sat: [{ z: 13, x: 1, y: 5086 }, { z: 13, x: 2, y: 5086 }] })
    const old = await d.caches.open('sat-v1')
    await old.put(satUrl(1), new Response('viejo'))
    const s1 = await prepareTrip(trip, { ...d, fetch: recorder((u) => u.includes('eox.at')).fetchImpl })
    expect(s1.sat).toEqual({ done: 1, total: 2 })
    expect(s1.satDb).toBe(false)
    expect(d.caches.stores.has('sat-v1')).toBe(true)
    const again = recorder()
    const s2 = await prepareTrip(trip, { ...d, fetch: again.fetchImpl })
    expect(again.calls.filter((u) => u.includes('eox.at'))).toEqual([satUrl(2)])
    expect(s2.satDb).toBe(true)
    expect(d.caches.stores.has('sat-v1')).toBe(false)
  })

  it('updating without satellite leaves the old sat-v1 alone and still asks to move it', async () => {
    const d = deps({ sat: [{ z: 13, x: 1, y: 5086 }] })
    d.store.set(statusKey(trip.id), { sat: { done: 1, total: 1 } })
    const old = await d.caches.open('sat-v1')
    await old.put(satUrl(1), new Response('viejo'))
    const s = await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl, withSat: false })
    expect(d.caches.stores.has('sat-v1')).toBe(true)
    expect(d.satStore.tiles.size).toBe(0)
    expect(needsSatMove(s)).toBe(true)
  })

  it('a first download cut half way is not taken as old satellite to move', async () => {
    const d = deps({ sat: manySat(400) })
    let saved = null
    await prepareTrip(trip, {
      ...d,
      fetch: recorder().fetchImpl,
      onProgress: (p) => { if (p.step === 'sat' && p.done >= 360) saved ??= d.store.get(statusKey(trip.id)) },
    })
    expect(needsSatMove(saved)).toBe(false)
  })

  it('waits at each batch and a pause stops the tiles without losing what is saved', async () => {
    const d = deps({ sat: manySat(24) })
    let batches = 0
    const paused = Object.assign(new Error('pausada'), { name: 'PausedError' })
    const s = await prepareTrip(trip, {
      ...d,
      fetch: recorder().fetchImpl,
      beforeBatch: async () => { if (++batches > 3) throw paused },
    })
    expect(s.depth).toEqual({ done: 10, total: 10 })
    expect(s.sat).toEqual({ done: 12, total: 24 })
    expect(s.missing.join(' ')).toMatch(/Satélite: 12 de 24 teselas \(la pausaste\)/)
    expect(s.dataAt).not.toBeNull()
  })

  it('keeps the satDb mark when a later update skips the satellite', async () => {
    const d = deps({ sat: [{ z: 13, x: 1, y: 5086 }] })
    await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl })
    const s = await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl, withSat: false })
    expect(s.satDb).toBe(true)
    expect(needsSatMove(s)).toBe(false)
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

  it('a cut Actualizar keeps the saved counts: re-checking starts low but the tiles are still there', async () => {
    const SAT = manySat(20)
    const d = deps({ sat: SAT })
    await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl })
    let seen = null
    await prepareTrip(trip, {
      ...d,
      fetch: recorder().fetchImpl,
      onProgress: (p) => { if (p.step === 'sat') seen ??= { ...p, saved: d.store.get(statusKey(trip.id)) } },
    })
    expect(seen.done).toBe(12) // la primera tanda: todavía no volvió a contar todas
    expect(seen.saved.sat).toEqual({ done: 20, total: 20 })
    expect(seen.saved.depth).toEqual({ done: 10, total: 10 })
  })

  it('saves the progress while downloading, so a cut first download keeps the count', async () => {
    const d = deps({ sat: manySat(400) })
    let saved = null
    await prepareTrip(trip, {
      ...d,
      fetch: recorder().fetchImpl,
      onProgress: (p) => { if (p.step === 'sat' && p.done >= 360) saved ??= d.store.get(statusKey(trip.id)).sat },
    })
    expect(saved.done).toBeGreaterThanOrEqual(300)
  })

  it('when a run finishes, its count wins even if it is lower than the saved one', async () => {
    const SAT = manySat(2)
    const d = deps({ sat: SAT })
    await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl })
    d.satStore = fakeSatStore()
    const s = await prepareTrip(trip, { ...d, fetch: recorder((u) => u.includes('eox.at')).fetchImpl })
    expect(s.sat).toEqual({ done: 0, total: 2 })
    expect(d.store.get(statusKey(trip.id)).sat).toEqual({ done: 0, total: 2 })
  })

  it('updating without satellite does not forget the satellite already downloaded', async () => {
    const d = deps({ sat: manySat(2) })
    await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl })
    const s = await prepareTrip(trip, { ...d, fetch: recorder().fetchImpl, withSat: false })
    expect(s.sat).toEqual({ done: 2, total: 2 })
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

describe('river trip zone', () => {
  const rio = { ...trip, lat: -33.968, lon: -59.256, water: 'rio' }
  it('has no depth tiles and a 100 km satellite zone', () => {
    expect(depthTiles(rio)).toEqual([])
    expect(satTiles(rio).length).toBe(tilesInRadius(rio.lat, rio.lon, 100, 8, 13).length)
  })
  it('sea trips keep 250 km', () => {
    expect(depthTiles(trip).length).toBe(tilesInRadius(trip.lat, trip.lon, 250, 8, 10).length)
    expect(satTiles({ ...trip, water: 'mar' }).length).toBe(tilesInRadius(trip.lat, trip.lon, 250, 8, 13).length)
  })
  it('prepares a river trip with depth.total 0', async () => {
    const s = await prepareTrip(rio, { ...deps({ tiles: undefined }), fetch: recorder().fetchImpl })
    expect(s.depth.total).toBe(0)
  })
})

describe('catchesNear step', () => {
  it('pulls nearby catches with the zone radius', async () => {
    const seen = []
    const s = await prepareTrip({ ...trip, water: 'rio' }, { ...deps(), fetch: recorder().fetchImpl, pullCatchesNear: async (lat, lon, km) => void seen.push([lat, lon, km]) })
    expect(seen).toEqual([[trip.lat, trip.lon, 100]])
    expect(s.missing).not.toContain('Capturas del grupo: sin señal')
  })
  it('a rejecting pull adds its line to missing', async () => {
    const s = await prepareTrip(trip, { ...deps(), fetch: recorder().fetchImpl, pullCatchesNear: async () => { throw new Error('rpc') } })
    expect(s.missing).toContain('Capturas del grupo: sin señal')
  })
})

describe('needsResume', () => {
  it('is true only when tiles stayed half way', () => {
    const d = { done: 2, total: 2 }
    expect(needsResume(null)).toBe(false)
    expect(needsResume({ depth: d, sat: null })).toBe(false)
    expect(needsResume({ depth: d, sat: d })).toBe(false)
    expect(needsResume({ depth: { done: 1, total: 2 }, sat: null })).toBe(true)
    expect(needsResume({ depth: d, sat: { done: 1, total: 2 } })).toBe(true)
  })
})

describe('needsSatMove', () => {
  it('asks only when there is satellite saved the old way', () => {
    expect(needsSatMove(null)).toBe(false)
    expect(needsSatMove({ sat: null })).toBe(false)
    expect(needsSatMove({ sat: { done: 5, total: 5 } })).toBe(true)
    expect(needsSatMove({ sat: { done: 5, total: 5 }, satDb: true })).toBe(false)
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

describe('isReady', () => {
  const done = { missing: [], dataAt: 'x', depth: { done: 2, total: 2 }, sat: { done: 3, total: 3 } }
  it('needs every chosen download complete', () => {
    expect(isReady(done)).toBe(true)
    expect(isReady({ ...done, sat: null })).toBe(true)
    expect(isReady({ ...done, sat: { done: 1, total: 3 } })).toBe(false)
    expect(isReady({ ...done, depth: { done: 0, total: 2 } })).toBe(false)
    expect(isReady({ ...done, dataAt: null })).toBe(false)
    expect(isReady({ ...done, missing: ['Fotos'] })).toBe(false)
    expect(isReady(null)).toBe(false)
  })
})

describe('satTime', () => {
  it('gives the measured range for a full download', () => {
    expect(satTime(24688)).toBe('15–38 min')
  })
  it('does not show a range when both ends round to the same minutes', () => {
    expect(satTime(100)).toBe('1 min')
  })
})

describe('satMissing', () => {
  const total = 24688
  it('is everything when nothing was saved or the satellite was skipped', () => {
    expect(satMissing(total, null)).toBe(total)
    expect(satMissing(total, { sat: null })).toBe(total)
  })
  it('is what is left of a partial download', () => {
    expect(satMissing(total, { sat: { done: total - 5, total } })).toBe(5)
    expect(satMissing(total, { sat: { done: total, total } })).toBe(0)
  })
  it('is everything when the zone changed', () => {
    expect(satMissing(total, { sat: { done: 100, total: 100 } })).toBe(total)
  })
})
