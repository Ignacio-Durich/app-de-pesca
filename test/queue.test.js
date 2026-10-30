import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake supabase client: records calls; `fail` makes every call answer {error}.
function fakeClient({ upsertError = null, uploadError = null } = {}) {
  const calls = { upsert: [], delete: [], upload: [] }
  const c = {
    calls,
    opts: { upsertError, uploadError },
    from: (table) => ({
      upsert: async (row) => (calls.upsert.push({ table, row }), { error: c.opts.upsertError }),
      delete: () => ({ eq: async (col, id) => (calls.delete.push({ table, col, id }), { error: c.opts.upsertError }) }),
    }),
    storage: {
      from: (bucket) => ({
        upload: async (path, blob, o) => (calls.upload.push({ bucket, path, blob, o }), { error: c.opts.uploadError }),
      }),
    },
  }
  return c
}

const op = (id, extra = {}) => ({ id, table: 'catches', kind: 'upsert', row: { id: 'r-' + id }, ...extra })

let Q
beforeEach(async () => {
  vi.resetModules()
  vi.restoreAllMocks()
  const { clear } = await import('idb-keyval')
  await clear()
  Q = await import('../src/lib/queue.js')
})

describe('queue', () => {
  it('flush uploads the photo first, then upserts the row, and empties the queue', async () => {
    const c = fakeClient()
    const blob = new Blob(['jpg'], { type: 'image/jpeg' })
    await Q.enqueue(op('1', { photo: { path: 't/a.jpg', blob } }))
    expect(await Q.flush(c)).toEqual({ done: 1, failed: 0 })
    expect(c.calls.upload[0]).toMatchObject({ bucket: 'catch-photos', path: 't/a.jpg', o: { contentType: 'image/jpeg' } })
    expect(c.calls.upsert).toEqual([{ table: 'catches', row: { id: 'r-1' } }])
    expect(await Q.pending()).toHaveLength(0)
  })

  it('delete ops call delete().eq(id)', async () => {
    const c = fakeClient()
    await Q.enqueue({ id: 'd', table: 'catches', kind: 'delete', rowId: 'x' })
    await Q.flush(c)
    expect(c.calls.delete).toEqual([{ table: 'catches', col: 'id', id: 'x' }])
  })

  it('a failing flush keeps the op with a future nextTry and counts tries', async () => {
    const now = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const c = fakeClient({ upsertError: { message: 'offline' } })
    await Q.enqueue(op('1'))
    expect(await Q.flush(c)).toEqual({ done: 0, failed: 1 })
    let [o] = await Q.pending()
    expect(o).toMatchObject({ tries: 1, nextTry: now + 10_000 })
    // not due yet: not retried
    expect(await Q.flush(c)).toEqual({ done: 0, failed: 0 })
    expect(c.calls.upsert).toHaveLength(1)
    // backoff doubles and is capped at 10 min
    vi.spyOn(Date, 'now').mockReturnValue(now + 10_000)
    await Q.flush(c)
    ;[o] = await Q.pending()
    expect(o).toMatchObject({ tries: 2, nextTry: now + 10_000 + 20_000 })
    for (let i = 0; i < 12; i++) {
      const t = (await Q.pending())[0].nextTry
      vi.spyOn(Date, 'now').mockReturnValue(t)
      await Q.flush(c)
    }
    const last = (await Q.pending())[0]
    expect(last.nextTry - Date.now()).toBe(600_000)
  })

  it('a thrown error is a failure too, and later ops still run', async () => {
    const c = fakeClient()
    const orig = c.from
    c.from = (t) => ({ ...orig(t), upsert: async (row) => { if (row.id === 'r-1') throw new Error('boom'); return orig(t).upsert(row) } })
    await Q.enqueue(op('1'))
    await Q.enqueue(op('2'))
    expect(await Q.flush(c)).toEqual({ done: 1, failed: 1 })
    expect((await Q.pending()).map((o) => o.id)).toEqual(['1'])
  })

  it('a failed op blocks later ops on the same row (order per row)', async () => {
    const c = fakeClient({ upsertError: { message: 'x' } })
    await Q.enqueue(op('1', { row: { id: 'same', v: 1 } }))
    await Q.enqueue(op('2', { row: { id: 'same', v: 2 } }))
    expect(await Q.flush(c)).toEqual({ done: 0, failed: 1 })
    expect(c.calls.upsert).toHaveLength(1)
    expect(await Q.pending()).toHaveLength(2)
  })

  it('survives reopening the app: op and Blob are still there', async () => {
    const c = fakeClient({ upsertError: { message: 'offline' } })
    await Q.enqueue(op('1', { photo: { path: 't/a.jpg', blob: new Blob(['hola'], { type: 'image/jpeg' }) } }))
    await Q.flush(c)
    vi.resetModules()
    const Q2 = await import('../src/lib/queue.js')
    const [o] = await Q2.pending()
    expect(o.id).toBe('1')
    expect(o.tries).toBe(1)
    expect(o.photo.blob).toBeInstanceOf(Blob)
    expect(o.photo.blob.size).toBe(4)
  })

  it('retry after a row failure re-sends the same id; duplicate photo counts as success', async () => {
    let now = 5_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const c = fakeClient({ upsertError: { message: 'offline' } })
    await Q.enqueue(op('1', { photo: { path: 't/a.jpg', blob: new Blob(['x']) } }))
    await Q.flush(c)
    c.opts.upsertError = null
    c.opts.uploadError = { statusCode: '409', message: 'The resource already exists' }
    now += 60_000
    expect(await Q.flush(c)).toEqual({ done: 1, failed: 0 })
    expect(c.calls.upsert.map((u) => u.row.id)).toEqual(['r-1', 'r-1'])
    expect(await Q.pending()).toHaveLength(0)
  })

  it('a non-duplicate storage error is a failure', async () => {
    const c = fakeClient({ uploadError: { status: 500, message: 'down' } })
    await Q.enqueue(op('1', { photo: { path: 't/a.jpg', blob: new Blob(['x']) } }))
    expect(await Q.flush(c)).toEqual({ done: 0, failed: 1 })
    expect(c.calls.upsert).toHaveLength(0)
  })

  it('a second flush while one runs returns the same promise', async () => {
    const c = fakeClient()
    await Q.enqueue(op('1'))
    const a = Q.flush(c)
    const b = Q.flush(c)
    expect(b).toBe(a)
    await a
    expect(c.calls.upsert).toHaveLength(1)
  })

  it('onQueueChange fires on enqueue and flush, and unsubscribes', async () => {
    const cb = vi.fn()
    const off = Q.onQueueChange(cb)
    await Q.enqueue(op('1'))
    expect(cb).toHaveBeenCalledTimes(1)
    await Q.flush(fakeClient())
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    await Q.enqueue(op('2'))
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('concurrent enqueues do not lose ops', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((n) => Q.enqueue(op(String(n)))))
    expect(await Q.pending()).toHaveLength(5)
  })

  it('startAutoFlush flushes on start and stops', async () => {
    const c = fakeClient()
    await Q.enqueue(op('1'))
    const stop = Q.startAutoFlush(() => c)
    await vi.waitFor(() => expect(c.calls.upsert).toHaveLength(1))
    stop()
  })
})
