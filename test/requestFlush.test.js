import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const okClient = (calls) => ({
  from: (table) => ({ upsert: async (row) => (calls.push({ table, row }), { error: null }) }),
})
const tick = () => new Promise((r) => setTimeout(r, 20))

let Q, R
beforeEach(async () => {
  vi.resetModules()
  const { clear } = await import('idb-keyval')
  await clear()
  Q = await import('../src/lib/queue.js')
  R = await import('../src/lib/repo.js')
})
afterEach(() => vi.unstubAllGlobals())

describe('requestFlush', () => {
  it('saveRow uploads right away when online', async () => {
    const calls = []
    Q.startAutoFlush(() => okClient(calls))()
    await tick()
    await R.saveRow('checklist_items', 'T', { id: 'a' })
    await tick()
    expect(calls).toEqual([{ table: 'checklist_items', row: { id: 'a' } }])
    expect(await Q.pending()).toHaveLength(0)
  })

  it('does nothing when offline: the op stays queued', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const calls = []
    Q.startAutoFlush(() => okClient(calls))()
    await R.saveRow('checklist_items', 'T', { id: 'a' })
    await tick()
    expect(calls).toEqual([])
    expect(await Q.pending()).toHaveLength(1)
  })

  it('a write made while a flush is in flight is flushed right after it', async () => {
    const calls = []
    let release
    const gate = new Promise((r) => (release = r))
    const client = {
      from: () => ({ upsert: async (row) => (await gate, calls.push(row), { error: null }) }),
    }
    Q.startAutoFlush(() => client)()
    await tick()
    await R.saveRow('checklist_items', 'T', { id: 'a' }) // starts a flush that blocks on gate
    await tick()
    await R.saveRow('checklist_items', 'T', { id: 'b' }) // queued behind the in-flight flush
    release()
    await tick()
    await tick()
    expect(calls.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
