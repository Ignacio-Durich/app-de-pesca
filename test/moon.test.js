import { describe, it, expect } from 'vitest'
import { moonDay } from '../src/score/moon.js'

const LAT = -40.55
const LON = -62.23
const BA = -10800
const LOCAL = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/

// Fases de la Luna 2026 (hora UT): NASA/GSFC, F. Espenak,
// https://eclipse.gsfc.nasa.gov/phase/phases2001.html
//   Luna llena:  2026-11-24 14:53 UT (= 11:53 en Buenos Aires)
//   Luna nueva:  2026-11-09 07:02 UT (= 04:02 en Buenos Aires)
describe('moonDay', () => {
  it('2026-11-08 en San Blas: fraction en [0,1] y transit en hora local de ese día', () => {
    const m = moonDay('2026-11-08', LAT, LON, BA)
    expect(m.fraction).toBeGreaterThanOrEqual(0)
    expect(m.fraction).toBeLessThanOrEqual(1)
    expect(m.phase).toBeGreaterThanOrEqual(0)
    expect(m.phase).toBeLessThanOrEqual(1)
    for (const k of ['rise', 'set', 'transit', 'lowerTransit']) {
      if (m[k] !== undefined) {
        expect(m[k]).toMatch(LOCAL)
        expect(m[k].slice(0, 10)).toBe('2026-11-08')
      }
    }
    // cada tránsito falta ~1 día al mes; al menos uno de los dos existe
    expect(m.transit ?? m.lowerTransit).toMatch(LOCAL)
  })

  it('luna llena publicada (2026-11-24) da fraction > 0.95', () => {
    expect(moonDay('2026-11-24', LAT, LON, BA).fraction).toBeGreaterThan(0.95)
  })

  it('luna nueva publicada (2026-11-09) da fraction < 0.05', () => {
    expect(moonDay('2026-11-09', LAT, LON, BA).fraction).toBeLessThan(0.05)
  })
})
