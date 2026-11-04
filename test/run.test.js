import { describe, it, expect, vi } from 'vitest'
import { makeRun, mbLeft } from '../src/prepare/run.js'

const trip = { id: 't1', lat: 1, lon: 2 }
const tick = () => new Promise((r) => setTimeout(r, 0))
const OK = { missing: [] }, CUT = { missing: ['Satélite: 5 de 10 teselas'] }

function fakeDoc() {
  const fns = []
  return {
    visibilityState: 'visible',
    addEventListener: (_, fn) => fns.push(fn),
    set(state) { this.visibilityState = state; fns.forEach((f) => f()) },
  }
}
// prepareTrip de mentira: cada llamada queda abierta hasta que el test la termina.
function fakePrepare() {
  const calls = []
  const prepare = vi.fn((t, opts) => new Promise((resolve, reject) => calls.push({ t, opts, resolve, reject })))
  return { prepare, calls }
}
function setup(nav = {}) {
  const doc = fakeDoc(), { prepare, calls } = fakePrepare()
  return { doc, prepare, calls, run: makeRun({ prepare, doc, nav }) }
}

describe('prepare run', () => {
  it('does not start a second download while one is running', () => {
    const { run, prepare } = setup()
    run.start(trip, true)
    run.start(trip, false)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prepare.mock.calls[0][1].withSat).toBe(true)
    expect(run.get().running).toBe(true)
  })

  it('notifies progress and goes idle when it ends', async () => {
    const { run, calls } = setup()
    const seen = []
    run.subscribe((s) => seen.push(s.prog?.done))
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 6, total: 10 })
    expect(seen).toContain(6)
    calls[0].resolve(OK)
    await tick()
    expect(run.get()).toMatchObject({ running: false, prog: null, error: null })
  })

  it('a cut without leaving the app stops there: it does not retry on its own', async () => {
    const { run, calls } = setup()
    run.start(trip, true)
    calls[0].resolve(CUT)
    await tick()
    expect(calls).toHaveLength(1)
    expect(run.get().running).toBe(false)
  })

  it('reports an unexpected error', async () => {
    const { run, calls } = setup()
    run.start(trip, true)
    calls[0].reject(new Error('rota'))
    await tick()
    expect(run.get()).toMatchObject({ running: false, error: 'rota' })
  })

  it('coming back asks before going on, and holds the next batch until the answer', async () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 5, total: 10 })
    doc.set('hidden')
    expect(run.get().ask).toBeNull()
    doc.set('visible')
    expect(run.get().ask).toEqual({ mb: 73 })
    let passed = false
    calls[0].opts.beforeBatch().then(() => { passed = true })
    await tick()
    expect(passed).toBe(false)
    run.proceed()
    await tick()
    expect(passed).toBe(true)
    expect(run.get().ask).toBeNull()
  })

  it('"Ahora no" stops the batches and ends without retrying', async () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 5, total: 10 })
    doc.set('hidden')
    doc.set('visible')
    const held = calls[0].opts.beforeBatch()
    run.stop()
    await expect(held).rejects.toMatchObject({ name: 'PausedError' })
    await expect(calls[0].opts.beforeBatch()).rejects.toMatchObject({ name: 'PausedError' })
    calls[0].resolve(CUT)
    await tick()
    expect(calls).toHaveLength(1)
    expect(run.get().running).toBe(false)
  })

  it('a run cut while away waits for the answer and only then starts again', async () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 5, total: 10 })
    doc.set('hidden')
    calls[0].resolve(CUT)
    await tick()
    expect(calls).toHaveLength(1)
    expect(run.get().running).toBe(true)
    doc.set('visible')
    expect(run.get().ask).toEqual({ mb: 73 })
    expect(calls).toHaveLength(1)
    run.proceed()
    expect(calls).toHaveLength(2)
    expect(calls[1].opts.withSat).toBe(true)
  })

  it('after saying no to a run already cut, it goes idle', async () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 5, total: 10 })
    doc.set('hidden')
    calls[0].resolve(CUT)
    await tick()
    doc.set('visible')
    run.stop()
    expect(calls).toHaveLength(1)
    expect(run.get().running).toBe(false)
  })

  it('a batch that fails right after answering Seguir restarts, but a second cut does not loop', async () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 5, total: 10 })
    doc.set('hidden')
    doc.set('visible')
    run.proceed()
    calls[0].resolve(CUT)
    await tick()
    expect(calls).toHaveLength(2)
    calls[1].resolve(CUT)
    await tick()
    expect(calls).toHaveLength(2)
    expect(run.get().running).toBe(false)
  })

  it('finishing while away needs no question', async () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    doc.set('hidden')
    calls[0].resolve(OK)
    await tick()
    expect(run.get().running).toBe(false)
    doc.set('visible')
    expect(run.get().ask).toBeNull()
  })

  it('does not ask when the phone says it is on wifi (Android) and goes on by itself', async () => {
    const { run, doc, calls } = setup({ connection: { type: 'wifi' } })
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 5, total: 10 })
    doc.set('hidden')
    calls[0].resolve(CUT)
    await tick()
    doc.set('visible')
    expect(run.get().ask).toBeNull()
    expect(calls).toHaveLength(2)
  })

  it('asks when the phone says it is on cell data', () => {
    const { run, doc, calls } = setup({ connection: { type: 'cellular' } })
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 5, total: 10 })
    doc.set('hidden')
    doc.set('visible')
    expect(run.get().ask).toEqual({ mb: 73 })
  })

  it('does not ask when only small things are left', () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'data' })
    doc.set('hidden')
    doc.set('visible')
    expect(run.get().ask).toBeNull()
  })

  it('the count does not go back when a resumed run re-checks what is saved', async () => {
    const { run, doc, calls } = setup()
    run.start(trip, true)
    calls[0].opts.onProgress({ step: 'sat', done: 8, total: 10 })
    doc.set('hidden')
    calls[0].resolve(CUT)
    await tick()
    doc.set('visible')
    run.proceed()
    calls[1].opts.onProgress({ step: 'sat', done: 6, total: 10 })
    expect(run.get().prog.done).toBe(8)
    calls[1].opts.onProgress({ step: 'sat', done: 9, total: 10 })
    expect(run.get().prog.done).toBe(9)
  })

  it('keeps the screen on while running: asks again on return and releases at the end', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ release }))
    const { run, doc, calls } = setup({ wakeLock: { request } })
    run.start(trip, true)
    await tick()
    expect(request).toHaveBeenCalledTimes(1)
    doc.set('hidden')
    doc.set('visible')
    await tick()
    expect(request).toHaveBeenCalledTimes(2)
    calls[0].resolve(OK)
    await tick()
    expect(release).toHaveBeenCalled()
  })
})

describe('mbLeft', () => {
  it('estimates what is left to download from the current step', () => {
    expect(mbLeft({ step: 'sat', done: 0, total: 10 }, true)).toBe(145)
    expect(mbLeft({ step: 'sat', done: 5, total: 10 }, true)).toBe(73)
    expect(mbLeft({ step: 'depth', done: 0, total: 412 }, false)).toBe(22)
    expect(mbLeft({ step: 'depth', done: 412, total: 412 }, true)).toBe(145)
    expect(mbLeft({ step: 'region', done: 1e6, total: 3e6 }, false)).toBe(2)
    expect(mbLeft({ step: 'forecast' }, true)).toBe(145)
    expect(mbLeft({ step: 'data' }, true)).toBe(0)
    expect(mbLeft({ step: 'photos', done: 0, total: 3 }, true)).toBe(0)
  })
})
