import { describe, it, expect, vi, afterEach } from 'vitest'
import { MODELS } from '../src/forecast/fetch.js'
import { tripDays, nowLocal, pickDay, countdown, slotNow, noGoRanges, tideReaches, dayLabel, phaseLabel, heroWindows, riverLine, waterTempEstimate, readMode, markPlacement } from '../src/forecast/view.js'

describe('trip days', () => {
  it('lists every day of the trip, inclusive', () => {
    expect(tripDays('2026-10-31', '2026-11-02')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
  })
  it('picks today inside the trip, else the first day', () => {
    const days = ['2026-11-07', '2026-11-08', '2026-11-09']
    expect(pickDay(days, '2026-11-08')).toBe('2026-11-08')
    expect(pickDay(days, '2026-10-29')).toBe('2026-11-07')
  })
  it('labels a day with weekday and number', () => {
    expect(dayLabel('2026-11-07')).toBe('sáb 7')
  })
})

describe('nowLocal', () => {
  it('uses the place offset, not the device timezone', () => {
    expect(nowLocal(Date.parse('2026-11-08T02:30:59Z'), -10800)).toBe('2026-11-07T23:30')
  })
})

describe('countdown', () => {
  const s = '2026-11-08T12:30', e = '2026-11-08T14:45'
  it('before the window says how long is left', () => {
    expect(countdown('2026-11-08T10:15', s, e)).toBe('en 2 h 15 min')
    expect(countdown('2026-11-08T12:00', s, e)).toBe('en 30 min')
    expect(countdown('2026-11-08T10:30', s, e)).toBe('en 2 h')
  })
  it('inside the window says ahora', () => {
    expect(countdown('2026-11-08T12:30', s, e)).toBe('ahora')
    expect(countdown('2026-11-08T14:44', s, e)).toBe('ahora')
  })
  it('after the window says it passed', () => {
    expect(countdown('2026-11-08T14:45', s, e)).toBe('ya pasó')
  })
})

const slot = (t, extra = {}) => ({ t: `2026-11-08T${t}`, score: 5, ...extra })

describe('slotNow', () => {
  it('finds the 30 min slot that contains now', () => {
    const slots = [slot('10:00'), slot('10:30', { score: 8 }), slot('11:00')]
    expect(slotNow(slots, '2026-11-08T10:59').score).toBe(8)
    expect(slotNow(slots, '2026-11-08T11:30')).toBeUndefined()
  })
})

describe('noGoRanges', () => {
  it('groups consecutive noGo slots into HH:MM–HH:MM', () => {
    const slots = ['09:00', '09:30', '10:00', '10:30', '11:00'].map((t, i) => slot(t, { noGo: [0, 1, 0, 1, 1][i] === 1 }))
    expect(noGoRanges(slots)).toEqual(['09:30–10:00', '10:30–11:30'])
  })
})

describe('tideReaches', () => {
  const f = { lastTideT: '2026-11-07T20:00' }
  it('is true up to the day of the last tide value', () => {
    expect(tideReaches(f, '2026-11-07')).toBe(true)
    expect(tideReaches(f, '2026-11-08')).toBe(false)
    expect(tideReaches({ lastTideT: null }, '2026-11-07')).toBe(false)
  })
})

describe('phaseLabel', () => {
  it('describes the tide phase and the next extreme', () => {
    expect(phaseLabel({ rising: true, next: { t: '2026-11-08T14:08', type: 'high' } })).toBe('creciente, pleamar 14:08')
    expect(phaseLabel(null)).toBeNull()
  })
})

describe('heroWindows (F5)', () => {
  const D = '2026-11-08'
  const w = (start, end, score) => ({ start: `${D}T${start}`, end: `${D}T${end}`, score })
  const ws = [w('07:00', '09:00', 9), w('15:00', '16:30', 8), w('18:00', '19:00', 7)]
  it('today: windows that already ended are dropped, the rest keep their order', () => {
    expect(heroWindows(ws, `${D}T10:00`, true)).toEqual([ws[1], ws[2]])
  })
  it('today: a window in progress is kept', () => {
    expect(heroWindows(ws, `${D}T08:30`, true)).toEqual(ws)
  })
  it('today, all ended → empty (the hero says they already passed)', () => {
    expect(heroWindows(ws, `${D}T19:00`, true)).toEqual([])
  })
  it('another day: unchanged', () => {
    expect(heroWindows(ws, `${D}T22:00`, false)).toEqual(ws)
  })
})

describe('river copy', () => {
  it('riverLine', () => {
    expect(riverLine(8)).toBe('Río creciendo, +8 cm/día')
    expect(riverLine(-20)).toBe('Río bajando, -20 cm/día')
    expect(riverLine(2.4)).toBe('Río estable, +2 cm/día')
    expect(riverLine(null)).toBe('Río: sin tendencia')
  })
  const hrs = (n, temp) => Array.from({ length: n }, (_, i) => ({
    t: new Date(Date.UTC(2026, 10, 6, i)).toISOString().slice(0, 16), temp: Object.fromEntries(Object.keys(MODELS).map((k, j) => [k, j ? null : temp])),
  }))
  it('waterTempEstimate averages the 5 days before the day', () => {
    expect(waterTempEstimate(hrs(120, 20), '2026-11-11')).toBe(20)
  })
  it('waterTempEstimate is null with under 24 h of data', () => {
    expect(waterTempEstimate(hrs(23, 20), '2026-11-11')).toBeNull()
  })
  it('riverLine has no negative zero', () => {
    expect(riverLine(-0.4)).toBe('Río estable, +0 cm/día')
  })
  it('waterTempEstimate uses the median of models and excludes T00:00 of the day', () => {
    const ks = Object.keys(MODELS)
    const mk = (n, vals, from = '2026-11-06T00:00') => Array.from({ length: n }, (_, i) => ({
      t: new Date(Date.parse(from + 'Z') + i * 3600000).toISOString().slice(0, 16),
      temp: Object.fromEntries(ks.map((k, j) => [k, vals[j] ?? null])),
    }))
    expect(waterTempEstimate(mk(120, [10, 20, 90]), '2026-11-11')).toBe(20)
    // una hora extra a las 00:00 del día (vale 99) no cuenta
    const h = [...mk(120, [20]), ...mk(1, [99], '2026-11-11T00:00')]
    expect(waterTempEstimate(h, '2026-11-11')).toBe(20)
  })
})

describe('markPlacement', () => {
  it('puts marks in range as lines and out-of-range ones at the edges', () => {
    expect(markPlacement({ alert: 2, low: 0.3 }, 0.8, 1.1)).toEqual([
      { kind: 'alerta', v: 2, edge: 'top' }, { kind: 'aguas bajas', v: 0.3, edge: 'bottom' },
    ])
    expect(markPlacement({ alert: 1, low: 0.3 }, 0.3, 1.1).map((m) => m.edge)).toEqual(['in', 'in'])
    expect(markPlacement(null, 0, 1)).toEqual([])
  })
})

describe('readMode', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reads the stored mode, defaulting to costa', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'embarcado' })
    expect(readMode()).toBe('embarcado')
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(readMode()).toBe('costa')
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('x') } })
    expect(readMode()).toBe('costa')
  })
})
