import { describe, expect, test } from 'vitest'
import { zonesAt } from '../src/regulation/zones.js'
import zones from '../src/data/zones.json'

// Cuadrado sintético de 0,1° (~9 km de lado en esta latitud) centrado en (−34, −59).
const square = [
  { id: 'ba', polygon: [[-59.05, -34.05], [-58.95, -34.05], [-58.95, -33.95], [-59.05, -33.95], [-59.05, -34.05]] },
  { id: 'er', polygon: [[-59.15, -34.05], [-59.05, -34.05], [-59.05, -33.95], [-59.15, -33.95], [-59.15, -34.05]] },
]
const KM_PER_DEG_LON = 111.32 * Math.cos((34 * Math.PI) / 180)

describe('zonesAt', () => {
  test('un punto adentro da su zona', () => {
    expect(zonesAt(-34, -59, square, 1)).toEqual(['ba'])
  })

  test('a 0,5 km del borde da las dos zonas', () => {
    const lon = -59.05 + 0.5 / KM_PER_DEG_LON
    expect(zonesAt(-34, lon, square, 1).sort()).toEqual(['ba', 'er'])
  })

  test('a 2 km del borde da una sola', () => {
    const lon = -59.05 + 2 / KM_PER_DEG_LON
    expect(zonesAt(-34, lon, square, 1)).toEqual(['ba'])
  })

  test('lejos de todo da []', () => {
    expect(zonesAt(-30, -55, square, 1)).toEqual([])
  })

  test('zones.json real: Chacras del Paraná es Buenos Aires', () => {
    expect(zonesAt(-33.968, -59.256, zones)).toContain('ba')
  })

  test('zones.json trae las dos provincias con fuente OSM', () => {
    expect(new Set(zones.map((z) => z.id))).toEqual(new Set(['ba', 'er']))
    for (const z of zones) expect(z.source).toMatch(/OpenStreetMap/)
  })
})
