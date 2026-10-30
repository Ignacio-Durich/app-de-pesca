import { describe, it, expect } from 'vitest'
import { tilesInRadius } from '../src/map/tiles.js'

// Bahía San Blas (spec §3.1), radio y zooms de la capa de profundidad (spec §3.4).
const LAT = -40.5512, LON = -62.2349, R = 80

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180
const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

describe('tilesInRadius', () => {
  const tiles = tilesInRadius(LAT, LON, R, 8, 12)

  it('includes the center tile at every zoom', () => {
    for (let z = 8; z <= 12; z++) {
      const x = Math.floor(lon2x(LON, z)), y = Math.floor(lat2y(LAT, z))
      expect(tiles).toContainEqual({ z, x, y })
    }
  })

  it('has no duplicates', () => {
    const keys = tiles.map((t) => `${t.z}/${t.x}/${t.y}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('grows with the zoom', () => {
    const count = (z) => tiles.filter((t) => t.z === z).length
    for (let z = 9; z <= 12; z++) expect(count(z)).toBeGreaterThan(count(z - 1))
  })

  it('every tile touches the square of side 2·radius', () => {
    const dLat = (R / 6371.0088) * (180 / Math.PI)
    const dLon = dLat / Math.cos((LAT * Math.PI) / 180)
    for (const { z, x, y } of tiles) {
      const west = x2lon(x, z), east = x2lon(x + 1, z), north = y2lat(y, z), south = y2lat(y + 1, z)
      expect(east).toBeGreaterThan(LON - dLon)
      expect(west).toBeLessThan(LON + dLon)
      expect(north).toBeGreaterThan(LAT - dLat)
      expect(south).toBeLessThan(LAT + dLat)
    }
  })

  it('covers the whole square at the top zoom (corners included)', () => {
    const dLat = (R / 6371.0088) * (180 / Math.PI)
    const dLon = dLat / Math.cos((LAT * Math.PI) / 180)
    for (const [la, lo] of [[LAT - dLat, LON - dLon], [LAT + dLat, LON + dLon]]) {
      expect(tiles).toContainEqual({ z: 12, x: Math.floor(lon2x(lo, 12)), y: Math.floor(lat2y(la, 12)) })
    }
  })
})
