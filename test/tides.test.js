import { describe, it, expect } from 'vitest'
import fixture from './fixtures/marine-sanblas.json'
import { parseLocal, formatLocal, localToUtcDate } from '../src/lib/time.js'
import { findExtremes, tidePhaseAt } from '../src/forecast/tides.js'

const series = (h = fixture.hourly) =>
  h.time.map((t, i) => ({ t, sea: h.sea_level_height_msl[i] }))
const day7 = (ext) => ext.filter((e) => e.t.startsWith('2026-11-07'))

describe('time', () => {
  it('parseLocal difference is device independent', () => {
    expect(parseLocal('2026-11-07T00:00') - parseLocal('2026-11-06T23:30')).toBe(30)
  })
  it('accepts seconds and round-trips with formatLocal', () => {
    expect(parseLocal('2026-11-07T12:00:00')).toBe(parseLocal('2026-11-07T12:00'))
    expect(formatLocal(parseLocal('2026-11-07T12:34'))).toBe('2026-11-07T12:34')
  })
  it('localToUtcDate applies the offset', () => {
    expect(localToUtcDate('2026-11-07T12:00', -10800).toISOString()).toBe('2026-11-07T15:00:00.000Z')
  })
})

describe('findExtremes', () => {
  it('finds the 4 extremes of 7/11 close to the tide forecast', () => {
    const ext = day7(findExtremes(series()))
    expect(ext.map((e) => e.type)).toEqual(['high', 'low', 'high', 'low'])
    ;['2026-11-07T00:42', '2026-11-07T07:05', '2026-11-07T13:09', '2026-11-07T19:09'].forEach((t, i) => {
      expect(Math.abs(parseLocal(ext[i].t) - parseLocal(t))).toBeLessThanOrEqual(20)
    })
  })
  it('ignores nulls without cutting the series', () => {
    const s = series()
    s[s.findIndex((p) => p.t === '2026-11-07T03:00')].sea = null
    expect(day7(findExtremes(s))).toHaveLength(4)
  })
})

describe('tidePhaseAt', () => {
  const ext = findExtremes(series())
  it('is rising at 12:00 on 7/11 with the next high within 50-90 min', () => {
    const p = tidePhaseAt(parseLocal('2026-11-07T12:00'), ext)
    expect(p.rising).toBe(true)
    expect(p.toNextMin).toBeGreaterThanOrEqual(50)
    expect(p.toNextMin).toBeLessThanOrEqual(90)
    expect(p.prev.type).toBe('low')
    expect(p.next.type).toBe('high')
  })
  it('returns null outside the extremes range', () => {
    expect(tidePhaseAt(parseLocal('2026-01-01T00:00'), ext)).toBeNull()
    expect(tidePhaseAt(parseLocal('2030-01-01T00:00'), ext)).toBeNull()
  })
})
