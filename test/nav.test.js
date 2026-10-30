import { describe, it, expect } from 'vitest'
import { distanceBearing, toDegMin } from '../src/map/nav.js'

describe('distanceBearing', () => {
  it('un grado de longitud en el ecuador', () => {
    const r = distanceBearing(0, 0, 0, 1)
    expect(r.km).toBeCloseTo(111.2, 1)
    expect(Math.abs(r.deg - 90)).toBeLessThan(0.01)
  })
  it('San Blas: distancia y rumbo', () => {
    const r = distanceBearing(-40.55, -62.23, -40.9, -61.8)
    expect(Math.abs(r.km - 53.18)).toBeLessThan(0.1)
    expect(Math.abs(r.deg - 137.2)).toBeLessThan(0.5)
  })
  it('rumbo siempre entre 0 y 360', () => {
    const r = distanceBearing(0, 0, 0, -1)
    expect(r.deg).toBeCloseTo(270, 5)
  })
})

describe('toDegMin', () => {
  it('formato náutico con coma y O/S', () => {
    expect(toDegMin(-40.55, -62.23)).toBe("40°33,0' S  62°13,8' O")
  })
  it('hemisferios N/E', () => {
    expect(toDegMin(10.5, 20.25)).toBe("10°30,0' N  20°15,0' E")
  })
  it('no muestra 60,0 minutos', () => {
    expect(toDegMin(-40.99999, -62.0)).toBe("41°00,0' S  62°00,0' O")
  })
})
