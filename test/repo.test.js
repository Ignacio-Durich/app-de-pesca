import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const T = 'trip-1'

// Fake client for pull: records select/eq and answers `data`.
function pullClient(data) {
  const seen = []
  return {
    seen,
    from: (table) => ({
      select: (cols) => {
        const q = { table, cols, eq: null }
        seen.push(q)
        const p = Promise.resolve({ data, error: null })
        p.eq = (col, val) => ((q.eq = [col, val]), p)
        return p
      },
    }),
  }
}

const okClient = () => ({ from: () => ({ upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }) })

// select() that answers `data` only when `release()` is called; `called` resolves once select ran.
function gatedClient(data) {
  let release, onCall
  const gate = new Promise((r) => (release = r))
  const called = new Promise((r) => (onCall = r))
  const client = { from: () => ({ select: () => { onCall(); const p = gate.then(() => ({ data, error: null })); p.eq = () => p; return p } }) }
  return { client, release, called }
}

let R, Q
beforeEach(async () => {
  vi.resetModules()
  const { clear } = await import('idb-keyval')
  await clear()
  R = await import('../src/lib/repo.js')
  Q = await import('../src/lib/queue.js')
})

describe('repo', () => {
  it('saveRow shows the row at once and queues one op', async () => {
    await R.saveRow('checklist_items', T, { id: 'a', trip_id: T, text: 'cañas' })
    expect(await R.listRows('checklist_items', T)).toEqual([{ id: 'a', trip_id: T, text: 'cañas' }])
    const p = await Q.pending()
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ table: 'checklist_items', kind: 'upsert', row: { id: 'a' }, tries: 0, nextTry: 0 })
  })

  it('saveRow replaces by id, with a photo in the op', async () => {
    const blob = new Blob(['x'])
    await R.saveRow('catches', T, { id: 'c', n: 1 }, { path: `${T}/c.jpg`, blob })
    await R.saveRow('catches', T, { id: 'c', n: 2 })
    expect(await R.listRows('catches', T)).toEqual([{ id: 'c', n: 2 }])
    expect((await Q.pending())[0].photo.path).toBe(`${T}/c.jpg`)
  })

  it('deleteRow removes locally and queues a delete', async () => {
    await R.saveRow('catches', T, { id: 'c' })
    await R.deleteRow('catches', T, 'c')
    expect(await R.listRows('catches', T)).toEqual([])
    expect((await Q.pending()).at(-1)).toMatchObject({ kind: 'delete', rowId: 'c', table: 'catches' })
  })

  it('listRows is empty before anything is stored', async () => {
    expect(await R.listRows('catches', T)).toEqual([])
  })

  it('local rows survive reopening the app', async () => {
    await R.saveRow('catches', T, { id: 'c' })
    vi.resetModules()
    const R2 = await import('../src/lib/repo.js')
    expect(await R2.listRows('catches', T)).toEqual([{ id: 'c' }])
  })

  it('pull replaces local rows with the server ones', async () => {
    await R.saveRow('catches', T, { id: 'old' })
    await Q.flush(okClient)
    const c = pullClient([{ id: 'new', trip_id: T }])
    expect(await R.pull(c, 'catches', T)).toEqual([{ id: 'new', trip_id: T }])
    expect(c.seen[0]).toMatchObject({ table: 'catches', cols: '*', eq: ['trip_id', T] })
    expect(await R.listRows('catches', T)).toEqual([{ id: 'new', trip_id: T }])
  })

  it('pull does not overwrite a row with a pending op', async () => {
    await R.saveRow('catches', T, { id: 'a', v: 'local' })
    const merged = await R.pull(pullClient([{ id: 'a', v: 'server' }, { id: 'b', v: 'server' }]), 'catches', T)
    expect(merged.find((r) => r.id === 'a').v).toBe('local')
    expect(merged.find((r) => r.id === 'b').v).toBe('server')
    expect(await R.listRows('catches', T)).toHaveLength(2)
  })

  it('pull does not resurrect a row with a pending delete', async () => {
    await R.saveRow('catches', T, { id: 'a' })
    await Q.flush(okClient)
    await R.deleteRow('catches', T, 'a')
    expect(await R.pull(pullClient([{ id: 'a' }]), 'catches', T)).toEqual([])
  })

  it('pull: an empty server answer on a trip scope keeps local rows (F2)', async () => {
    await R.saveRow('trips', T, { id: T, name: 'San Blas' })
    await Q.flush(okClient)
    expect(await R.pull(pullClient([]), 'trips', T)).toEqual([{ id: T, name: 'San Blas' }])
    expect(await R.listRows('trips', T)).toEqual([{ id: T, name: 'San Blas' }])
  })

  it('near scope selects all rows with no filter', async () => {
    const c = pullClient([{ id: 's' }])
    await R.pull(c, 'spots', 'near:-40.5,-62.2')
    expect(c.seen[0].eq).toBe(null)
    expect(await R.listRows('spots', 'near:-40.5,-62.2')).toEqual([{ id: 's' }])
  })

  it('pullCatchesNear calls the rpc and stores the rows under the near scope', async () => {
    const calls = []
    const c = { rpc: async (fn, args) => (calls.push([fn, args]), { data: [{ id: 'n1' }], error: null }) }
    expect(await R.pullCatchesNear(c, -33.968, -59.256, 100)).toEqual([{ id: 'n1' }])
    expect(calls).toEqual([['catches_near', { p_lat: -33.968, p_lon: -59.256, p_km: 100 }]])
    expect(await R.listRows('catchesNear', R.nearScope(-33.968, -59.256))).toEqual([{ id: 'n1' }])
  })

  it('pullCatchesNear throws on rpc error', async () => {
    await expect(R.pullCatchesNear({ rpc: async () => ({ data: null, error: new Error('x') }) }, 1, 2, 3)).rejects.toThrow('x')
  })

  it('pull throws on a server error and leaves local rows alone', async () => {
    await R.saveRow('catches', T, { id: 'a' })
    const bad = { from: () => ({ select: () => Object.assign(Promise.resolve({ data: null, error: { message: 'offline' } }), { eq() { return this } }) }) }
    await expect(R.pull(bad, 'catches', T)).rejects.toThrow('offline')
    expect(await R.listRows('catches', T)).toHaveLength(1)
  })

  it('ops record their trip: trip scope for trip tables, null for spots/soundings', async () => {
    await R.saveRow('catches', T, { id: 'c' })
    await R.deleteRow('checklist_items', T, 'x')
    await R.saveRow('trips', T, { id: T })
    await R.saveRow('spots', 'near:-40.5,-62.2', { id: 's' })
    await R.saveRow('soundings', 'near:-40.5,-62.2', { id: 'd' })
    expect((await Q.pending()).map((o) => o.tripId)).toEqual([T, T, T, null, null])
  })

  it('pull overlapping a flush does not drop a row that just uploaded', async () => {
    await R.saveRow('catches', T, { id: 'a', v: 'local' })
    // server read before the upsert committed ('z' keeps the answer non-empty, see F2)
    const { client, release, called } = gatedClient([{ id: 'z' }])
    const pulling = R.pull(client, 'catches', T)
    await called
    expect(await Q.flush(okClient)).toEqual({ done: 1, failed: 0 })
    release()
    expect(await pulling).toEqual([{ id: 'z' }, { id: 'a', v: 'local' }])
    expect(await R.listRows('catches', T)).toEqual([{ id: 'z' }, { id: 'a', v: 'local' }])
  })

  it('pull overlapping a flush does not resurrect a row that was just deleted', async () => {
    await R.saveRow('catches', T, { id: 'a' })
    await Q.flush(okClient)
    await R.deleteRow('catches', T, 'a')
    const { client, release, called } = gatedClient([{ id: 'a' }]) // server read before the delete committed
    const pulling = R.pull(client, 'catches', T)
    await called
    await Q.flush(okClient)
    release()
    expect(await pulling).toEqual([])
  })
})
