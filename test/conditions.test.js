import { describe, it, expect } from 'vitest'
import marine from './fixtures/marine-sanblas.json'
import weather from './fixtures/weather-sanblas.json'
import { normalize, MODELS } from '../src/forecast/fetch.js'
import { findExtremes } from '../src/forecast/tides.js'
import { parseLocal, formatLocal } from '../src/lib/time.js'
import { median, circularMean } from '../src/score/score.js'
import { conditionsAt } from '../src/catches/conditions.js'

const f = normalize(marine, weather, '2026-10-29T12:00:00Z')
const ext = findExtremes(f.hours)
const hour = (t) => f.hours.find((h) => h.t === t)
const models = Object.keys(MODELS)
const day7 = ext.filter((e) => e.t.startsWith('2026-11-07'))

describe('conditionsAt', () => {
  it('at 10:00 on 7/11: creciente, hourly tide height, wind = median of models', () => {
    const h = hour('2026-11-07T10:00')
    const c = conditionsAt(f, ext, '2026-11-07T10:00')
    expect(c.tide_phase).toBe('creciente')
    expect(c.tide_height_m).toBeCloseTo(h.sea, 6)
    expect(c.wind_kmh).toBeCloseTo(median(models.map((k) => h.wind[k])), 6)
    expect(c.wind_dir_deg).toBeCloseTo(circularMean(models.map((k) => h.dir[k])), 6)
  })

  it('interpolates tide height linearly between neighbouring hours', () => {
    const a = hour('2026-11-07T10:00').sea, b = hour('2026-11-07T11:00').sea
    expect(conditionsAt(f, ext, '2026-11-07T10:15').tide_height_m).toBeCloseTo(a + (b - a) / 4, 6)
    expect(conditionsAt(f, ext, '2026-11-07T10:30').tide_height_m).toBeCloseTo((a + b) / 2, 6)
  })

  it('is pleamar / bajamar 10 min from an extreme', () => {
    const high = day7.find((e) => e.type === 'high' && e.t > '2026-11-07T10:00')
    const low = day7.find((e) => e.type === 'low')
    expect(conditionsAt(f, ext, formatLocal(parseLocal(high.t) - 10)).tide_phase).toBe('pleamar')
    expect(conditionsAt(f, ext, formatLocal(parseLocal(high.t) + 10)).tide_phase).toBe('pleamar')
    expect(conditionsAt(f, ext, formatLocal(parseLocal(low.t) + 10)).tide_phase).toBe('bajamar')
  })

  it('is bajante between a high and the next low', () => {
    const high = day7.find((e) => e.type === 'high' && e.t > '2026-11-07T10:00')
    expect(conditionsAt(f, ext, formatLocal(parseLocal(high.t) + 120)).tide_phase).toBe('bajante')
  })

  it('returns nulls (no throw) outside the forecast', () => {
    expect(conditionsAt(f, ext, '2030-01-01T10:00')).toEqual({
      tide_phase: null, tide_height_m: null, wind_kmh: null, wind_dir_deg: null,
    })
  })

  it('returns null for a missing value while keeping the rest', () => {
    const g = structuredClone(f)
    g.hours.find((h) => h.t === '2026-11-07T11:00').sea = null
    const c = conditionsAt(g, ext, '2026-11-07T10:30')
    expect(c.tide_height_m).toBeNull()
    expect(c.tide_phase).toBe('creciente')
    expect(c.wind_kmh).not.toBeNull()
  })
})
