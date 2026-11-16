import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTrip, loadTrip, getMe, setMe, recentTrips, LOAD_TIMEOUT_MS, tripIdFrom, startPath, hasCreateKey, saveCreateKey } from '../src/trips/trips.js'
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
  startDate: '2026-11-07', endDate: '2026-11-09', members: ['Nacho', 'Beto'], water: 'mar', nightFishing: false,
}
const never = () => new Promise(() => {})

describe('createTrip', () => {
  it('guarda local, encola con el id del viaje y lo suma a recientes, sin red', async () => {
    const id = await createTrip(fields)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const [row] = await listRows('trips', id)
    expect(row).toMatchObject({ id, name: 'San Blas', place_name: 'San Blas', lat: -40.55, start_date: '2026-11-07', members: ['Nacho', 'Beto'], water: 'mar', night_fishing: false })
    expect((await pending()).some((o) => o.table === 'trips' && o.tripId === id)).toBe(true)
    expect(recentTrips()).toEqual([{ id, name: 'San Blas' }])
  })

  it('viaje de río: guarda water rio y night_fishing', async () => {
    const id = await createTrip({ ...fields, name: 'Lima', water: 'rio', nightFishing: true })
    const [row] = await listRows('trips', id)
    expect(row).toMatchObject({ water: 'rio', night_fishing: true })
  })
})

describe('loadTrip', () => {
  it('sin red y sin copia local: offlineFirstOpen', async () => {
    const r = await loadTrip('nuevo', { pullImpl: async () => { throw new Error('offline') } })
    expect(r).toEqual({ trip: null, offlineFirstOpen: true })
  })

  afterEach(() => vi.useRealTimers())
  it('sin copia local y la red colgada: offlineFirstOpen al vencer el tiempo (F3)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = loadTrip('colgado', { pullImpl: never })
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)
    expect(await p).toEqual({ trip: null, offlineFirstOpen: true })
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
    setMe('b', 'Caro')
    expect(getMe('a')).toBe('Nacho')
    expect(getMe('b')).toBe('Caro')
  })
})

describe('tripIdFrom (F1: pegar el link en la app instalada)', () => {
  const ID = '00000000-0000-4000-8000-000000000000'
  it('saca el id de un link, de un link con pantalla o texto alrededor, o del id solo', () => {
    expect(tripIdFrom(`https://pesca.example/t/${ID}`)).toBe(ID)
    expect(tripIdFrom(`Sumate al viaje: https://pesca.example/t/${ID}/mapa gracias`)).toBe(ID)
    expect(tripIdFrom(`  ${ID.toUpperCase()} `)).toBe(ID)
  })
  it('sin id válido: null', () => {
    expect(tripIdFrom('')).toBe(null)
    expect(tripIdFrom('https://pesca.example/t/abc')).toBe(null)
  })
})

describe('startPath', () => {
  const recents = [{ id: 'a', name: 'San Blas' }, { id: 'b', name: 'Otro' }]
  it('opening the app goes straight to the last trip', () => {
    expect(startPath('/', recents)).toBe('/t/a')
  })
  it('stays where it is on a trip link, or with no saved trips', () => {
    expect(startPath('/t/b', recents)).toBeNull()
    expect(startPath('/', [])).toBeNull()
  })
})

describe('recentTrips order', () => {
  it('opening a saved trip moves it first, so the app reopens there', async () => {
    const a = await createTrip(fields)
    const b = await createTrip({ ...fields, name: 'Otro' })
    expect(recentTrips()[0].id).toBe(b)
    await loadTrip(a, { pullImpl: async () => {} })
    expect(recentTrips().map((t) => t.id)).toEqual([a, b])
  })
})

describe('clave para crear viajes (migración 005)', () => {
  const server = (answer) => ({ rpc: async (fn) => (fn === 'check_create_key' ? answer : { error: new Error('rpc') }) })

  it('se guarda solo si el servidor dice que es la correcta', async () => {
    expect(hasCreateKey()).toBe(false)
    expect(await saveCreateKey('mala', server({ data: false, error: null }))).toBe(false)
    expect(hasCreateKey()).toBe(false)
    expect(await saveCreateKey('buena', server({ data: true, error: null }))).toBe(true)
    expect(hasCreateKey()).toBe(true)
  })

  it('sin red lanza y no guarda nada', async () => {
    await expect(saveCreateKey('x', server({ data: null, error: new Error('Failed to fetch') }))).rejects.toThrow()
    expect(hasCreateKey()).toBe(false)
  })
})
