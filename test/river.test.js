import { describe, it, expect } from 'vitest'
import { trendCmPerDay, trendFactor, trendLabel, pressureFactor } from '../src/score/river.js'
import { MODELS } from '../src/forecast/fetch.js'

describe('trendCmPerDay', () => {
  const pts = [
    { t: '2026-11-04T12:00', h: 1.0 }, { t: '2026-11-07T12:00', h: 1.6 },
  ]
  it('1,00 a 1,60 m en 3 días = 20 cm/día', () => {
    expect(trendCmPerDay(pts, '2026-11-07')).toBeCloseTo(20, 10)
  })
  it('sin una de las dos puntas → null', () => {
    expect(trendCmPerDay(pts.slice(1), '2026-11-07')).toBe(null)
    expect(trendCmPerDay(undefined, '2026-11-07')).toBe(null)
  })
})

describe('trendFactor y trendLabel', () => {
  it('umbrales', () => {
    expect(trendFactor(-16)).toBe(0.6)
    expect(trendFactor(-15)).toBe(1)
    expect(trendFactor(31)).toBe(0.7)
    expect(trendFactor(30)).toBe(1)
    expect(trendFactor(null)).toBe(1)
  })
  it('etiquetas', () => {
    expect(trendLabel(6)).toBe('creciendo')
    expect(trendLabel(-6)).toBe('bajando')
    expect(trendLabel(5)).toBe('estable')
    expect(trendLabel(null)).toBe(null)
  })
})

describe('pressureFactor', () => {
  const T = '2026-11-07T12:00', T0 = '2026-11-07T06:00'
  const hours = (p0, p1) => [
    { t: T0, pressure: Object.fromEntries(Object.keys(MODELS).map((k) => [k, p0])) },
    { t: T, pressure: Object.fromEntries(Object.keys(MODELS).map((k) => [k, p1])) },
  ]
  const tMin = Date.parse(T + ':00Z') / 60000
  it('caída 1.0, estable 0.6, suba 0.3', () => {
    expect(pressureFactor(hours(1015, 1013), tMin)).toBe(1.0)
    expect(pressureFactor(hours(1013, 1013), tMin)).toBe(0.6)
    expect(pressureFactor(hours(1013, 1015), tMin)).toBe(0.3)
  })
  it('sin datos → null', () => {
    expect(pressureFactor([], tMin)).toBe(null)
    expect(pressureFactor(hours(1013, 1013).slice(1), tMin)).toBe(null)
  })
})
