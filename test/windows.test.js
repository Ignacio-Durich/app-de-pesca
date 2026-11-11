import { describe, it, expect } from 'vitest'
import marine from './fixtures/marine-sanblas.json'
import weather from './fixtures/weather-sanblas.json'
import { normalize } from '../src/forecast/fetch.js'
import { findExtremes, tidePhaseAt } from '../src/forecast/tides.js'
import { parseLocal, formatLocal } from '../src/lib/time.js'
import { scoreDay } from '../src/score/score.js'
import { findWindows } from '../src/score/windows.js'

const EXT = [
  { t: '2026-11-07T06:46', type: 'low' },
  { t: '2026-11-07T13:18', type: 'high' },
  { t: '2026-11-07T18:50', type: 'low' },
]
// slots sintéticos cada 30 min desde `from`
const mk = (scores, { from = '10:00', night = false, wind = 12, dir = 225 } = {}) =>
  scores.map((score, i) => {
    const m = parseLocal(`2026-11-07T${from}`) + 30 * i
    return {
      t: formatLocal(m),
      score,
      night,
      windKmh: Array.isArray(wind) ? wind[i] : wind,
      meanKmh: Array.isArray(wind) ? wind[i] : wind,
      dirDeg: Array.isArray(dir) ? dir[i] : dir,
      phase: tidePhaseAt(m, EXT),
    }
  })

describe('findWindows', () => {
  it('[6,7,8,8,7,5] → one window from slot 2 to the start of slot 6', () => {
    const w = findWindows(mk([6, 7, 8, 8, 7, 5]), { nightFishing: false })
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ start: '2026-11-07T10:30', end: '2026-11-07T12:30', score: 8, weak: false })
  })

  it('no slot ≥7 → a single weak window with the best stretch', () => {
    const w = findWindows(mk([3, 5, 6, 6, 4, 6]), { nightFishing: false })
    expect(w).toEqual([expect.objectContaining({ start: '2026-11-07T11:00', end: '2026-11-07T12:00', score: 6, weak: true })])
  })

  it('night without night fishing gives no window; with night fishing it does', () => {
    expect(findWindows(mk([9, 9, 9], { night: true }), { nightFishing: false })).toEqual([])
    expect(findWindows(mk([9, 9, 9], { night: true }), { nightFishing: true })).toHaveLength(1)
  })

  it('noGo slots are never in a window, nor in the weak-day fallback', () => {
    const s = mk([8, 9, 8, 4], { from: '17:30' })
    s[1].noGo = true
    const w = findWindows(s, { nightFishing: false, mode: 'embarcado' })
    expect(w.map((x) => [x.start.slice(11), x.end.slice(11)])).toEqual([
      ['17:30', '18:00'],
      ['18:30', '19:00'],
    ])
    expect(w.every((x) => x.score === 8)).toBe(true)
    const weak = mk([5, 6, 4])
    weak[1].noGo = true
    expect(findWindows(weak, { nightFishing: false, mode: 'embarcado' })).toEqual([
      expect.objectContaining({ start: '2026-11-07T10:00', score: 5, weak: true }),
    ])
    const allNoGo = mk([9, 9]).map((x) => ({ ...x, noGo: true }))
    expect(findWindows(allNoGo, { nightFishing: false, mode: 'embarcado' })).toEqual([])
  })

  it('fixtures 7/11 embarcado: the noGo 18:30 slot (score 7) is in no window', () => {
    const f = normalize(marine, weather, '2026-10-29T12:00:00Z')
    const slots = scoreDay(f, findExtremes(f.hours), '2026-11-07', 'embarcado', { nightFishing: false })
    const bad = slots.find((s) => s.t === '2026-11-07T18:30')
    expect(bad.noGo).toBe(true)
    expect(bad.score).toBeGreaterThanOrEqual(7)
    const m = parseLocal(bad.t)
    for (const x of findWindows(slots, { nightFishing: false, mode: 'embarcado' }))
      expect(m >= parseLocal(x.start) && m < parseLocal(x.end)).toBe(false)
  })

  it('keeps the top 3 by score, ties → earlier', () => {
    const w = findWindows(mk([8, 4, 7, 4, 9, 4, 7, 4, 8]), { nightFishing: false })
    expect(w.map((x) => [x.start.slice(11), x.score])).toEqual([
      ['12:00', 9],
      ['10:00', 8],
      ['14:00', 8],
    ])
  })

  it('reason: end of rising + slack near the high, mean wind and cardinal (spec §2.2 example)', () => {
    const [w] = findWindows(mk([8, 8, 8, 8], { from: '11:00', wind: [10, 12, 13, 13] }), { nightFishing: false })
    expect(w.reason).toBe('fin de creciente + repunte, viento 12 km/h SO')
  })

  it('reason: a window starting 30 min after the high is still "fin de creciente + repunte" (F8)', () => {
    const [w] = findWindows(mk([8, 8], { from: '13:48' }), { nightFishing: false })
    expect(w.reason).toMatch(/^fin de creciente \+ repunte, /)
  })

  it('reason shows the mean wind, not the gust-inflated effective wind (F9)', () => {
    const s = mk([8, 8], { from: '08:30' }).map((x) => ({ ...x, windKmh: 21, meanKmh: 10 }))
    expect(findWindows(s, { nightFishing: false })[0].reason).toBe('creciente, viento 10 km/h SO')
  })

  it('reason: creciente / bajante / repunte (embarcado)', () => {
    expect(findWindows(mk([8, 8, 8], { from: '08:30' }), { nightFishing: false })[0].reason).toMatch(/^creciente, /)
    expect(findWindows(mk([8, 8, 8], { from: '15:30' }), { nightFishing: false })[0].reason).toMatch(/^bajante, /)
    const near = mk([8, 8, 8], { from: '17:30' })
    expect(findWindows(near, { nightFishing: false, mode: 'embarcado' })[0].reason).toMatch(/^repunte, /)
    expect(findWindows(near, { nightFishing: false, mode: 'costa' })[0].reason).toMatch(/^bajante, /)
  })

  it('cardinal uses the circular mean (350° and 10° → N)', () => {
    const [w] = findWindows(mk([8, 8], { from: '08:30', dir: [350, 10] }), { nightFishing: false })
    expect(w.reason).toBe('creciente, viento 12 km/h N')
  })

  it('fixtures 7/11 costa: up to 3 daytime windows, sorted by score', () => {
    const f = normalize(marine, weather, '2026-10-29T12:00:00Z')
    const slots = scoreDay(f, findExtremes(f.hours), '2026-11-07', 'costa', { nightFishing: false })
    const w = findWindows(slots, { nightFishing: false })
    expect(w.length).toBeGreaterThan(0)
    expect(w.length).toBeLessThanOrEqual(3)
    const { sunrise, sunset } = f.days['2026-11-07']
    for (const x of w) {
      expect(x.start >= sunrise).toBe(true)
      expect(parseLocal(x.end) - 30 < parseLocal(sunset)).toBe(true)
      expect(x.reason).toMatch(/viento \d+ km\/h (N|NE|E|SE|S|SO|O|NO)$/)
    }
    expect(w.map((x) => x.score)).toEqual([...w.map((x) => x.score)].sort((a, b) => b - a))
  })
})

describe('findWindows con note', () => {
  it('termina el motivo con la nota', () => {
    const w = findWindows(mk([8, 8, 8, 8, 8, 8, 8, 8]), { nightFishing: false, note: 'río creciendo, +8 cm/día' })
    expect(w[0].reason.endsWith(', río creciendo, +8 cm/día')).toBe(true)
    expect(findWindows(mk([8, 8, 8, 8, 8, 8, 8, 8]), { nightFishing: false })[0].reason).not.toContain('río')
  })
})
