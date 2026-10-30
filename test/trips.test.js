import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { createTrip, loadTrip, getMe, setMe, recentTrips } from '../src/trips/trips.js'
import { listRows, saveRow } from '../src/lib/repo.js'
import { pending } from '../src/lib/queue.js'

// Node no trae localStorage: uno mínimo en memoria.
beforeEach(() => {
  const m = new Map()
  globalThis.localStorage = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  }
})

const fields = {
  name: 'San Blas', placeName: 'San Blas', lat: -40.55, lon: -62.23,
  startDate: '2026-11-07', endDate: '2026-11-09', members: ['Nacho', 'Fernando'], water: 'mar', nightFishing: false,
}
const never = () => new Promise(() => {})

describe('createTrip', () => {
  it('guarda local, encola con el id del viaje y lo suma a recientes, sin red', async () => {
    const id = await createTrip(fields)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const [row] = await listRows('trips', id)
    expect(row).toMatchObject({ id, name: 'San Blas', place_name: 'San Blas', lat: -40.55, start_date: '2026-11-07', members: ['Nacho', 'Fernando'], water: 'mar', night_fishing: false })
    expect((await pending()).some((o) => o.table === 'trips' && o.tripId === id)).toBe(true)
    expect(recentTrips()).toEqual([{ id, name: 'San Blas' }])
  })
})

describe('loadTrip', () => {
  it('sin red y sin copia local: offlineFirstOpen', async () => {
    const r = await loadTrip('nuevo', { pullImpl: async () => { throw new Error('offline') } })
    expect(r).toEqual({ trip: null, offlineFirstOpen: true })
  })

  it('sin copia local y el server no lo tiene: offlineFirstOpen', async () => {
    expect(await loadTrip('vacio', { pullImpl: async () => [] })).toEqual({ trip: null, offlineFirstOpen: true })
  })

  it('con copia local devuelve source local sin esperar a la red', async () => {
    await saveRow('trips', 'abc', { id: 'abc', name: 'Local' })
    const r = await loadTrip('abc', { pullImpl: never })
    expect(r).toMatchObject({ trip: { id: 'abc', name: 'Local' }, source: 'local' })
  })

  it('sin copia local y con red: remote, y queda en recientes', async () => {
    const trip = { id: 'rem', name: 'Remoto' }
    const r = await loadTrip('rem', { pullImpl: async () => [trip] })
    expect(r).toEqual({ trip, source: 'remote' })
    expect(recentTrips()).toEqual([{ id: 'rem', name: 'Remoto' }])
  })
})

describe('getMe / setMe', () => {
  it('se guardan por viaje', () => {
    expect(getMe('a')).toBe(null)
    setMe('a', 'Nacho')
    setMe('b', 'Jero')
    expect(getMe('a')).toBe('Nacho')
    expect(getMe('b')).toBe('Jero')
  })
})
