import { describe, it, expect } from 'vitest'
import { decodeTerrarium, soundingDatum, depthBand, bandColor, tilePixel, depthAt, BANDS, MIN_DEPTH_M } from '../src/map/depth.js'
import { within } from '../src/map/nav.js'
import { depthTileUrl } from '../src/map/tiles.js'

describe('decodeTerrarium', () => {
  it('el valor probado en San Blas (spec §3.1)', () => {
    expect(Math.abs(decodeTerrarium(127, 219, 26) - -36.9)).toBeLessThan(0.01)
  })
  it('nivel del mar', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0)
  })
})

describe('soundingDatum', () => {
  it('medido − marea, redondeado al cm', () => {
    expect(soundingDatum(8.5, 1.2)).toBe(7.3)
    expect(soundingDatum(4, -0.35)).toBe(4.35)
  })
  it('sin marea no hay dato referido', () => {
    expect(soundingDatum(8.5, null)).toBeNull()
  })
})

describe('depthBand / bandColor', () => {
  it('bandas cada 5 m hasta 60 m; tierra y 0 m sin banda', () => {
    expect(depthBand(0)).toBeNull()
    expect(depthBand(6)).toBeNull()
    expect(depthBand(-4.9)).toBe(0)
    expect(depthBand(-5)).toBe(1)
    expect(depthBand(-36.9)).toBe(7)
    expect(depthBand(-59.9)).toBe(11)
    expect(depthBand(-60)).toBe(12)
    expect(depthBand(-300)).toBe(12)
  })
  it(`menos de MIN_DEPTH_M (${MIN_DEPTH_M} m) es ruido de ETOPO1 en la bahía: sin banda (R22)`, () => {
    expect(depthBand(-0.0078)).toBeNull()
    expect(depthBand(-0.5)).toBeNull()
    expect(depthBand(-1.5)).toBe(0)
  })
  it('un color distinto por banda', () => {
    const all = Array.from({ length: BANDS }, (_, b) => bandColor(b).join())
    expect(new Set(all).size).toBe(BANDS)
  })
})

describe('tilePixel', () => {
  it('esquinas conocidas', () => {
    expect(tilePixel(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1, px: 0, py: 0 })
    expect(tilePixel(85.05, -180, 2)).toEqual({ z: 2, x: 0, y: 0, px: 0, py: 0 })
  })
})

// Caché falsa con una sola tesela; decode devuelve una imagen 256×256 de un solo color.
const fakeCache = (lat, lon) => {
  const t = tilePixel(lat, lon, 12)
  return { match: async (url) => (url === depthTileUrl(t) ? {} : undefined) }
}
const solid = ([r, g, b]) => async () => {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i)
  return { data, width: 256, height: 256 }
}

describe('depthAt', () => {
  const LAT = -40.9, LON = -61.8
  it('tesela cacheada en el mar: decodifica el píxel', async () => {
    const d = await depthAt(LAT, LON, fakeCache(LAT, LON), solid([127, 219, 26]))
    expect(Math.abs(d - -36.9)).toBeLessThan(0.01)
  })
  it('tierra o 0 m: null', async () => {
    expect(await depthAt(LAT, LON, fakeCache(LAT, LON), solid([128, 0, 0]))).toBeNull()
    expect(await depthAt(LAT, LON, fakeCache(LAT, LON), solid([128, 6, 0]))).toBeNull()
  })
  it('entre −1 y 0 m (ruido de la bahía): null; −1,5 m vale (R22)', async () => {
    expect(await depthAt(LAT, LON, fakeCache(LAT, LON), solid([127, 255, 254]))).toBeNull() // −0,0078
    expect(await depthAt(LAT, LON, fakeCache(LAT, LON), solid([127, 255, 128]))).toBeNull() // −0,5
    expect(await depthAt(LAT, LON, fakeCache(LAT, LON), solid([127, 254, 128]))).toBe(-1.5)
  })
  it('sin la tesela en la caché: null, sin red', async () => {
    expect(await depthAt(LAT, LON, fakeCache(0, 0), solid([127, 219, 26]))).toBeNull()
  })
})

describe('within', () => {
  it('filtra por distancia y descarta filas sin coordenadas', () => {
    const rows = [
      { id: 'a', lat: -40.55, lon: -62.23 },
      { id: 'b', lat: -40.9, lon: -61.8 }, // ~53 km (nav.test)
      { id: 'c', lat: null, lon: null },
    ]
    expect(within(rows, -40.55, -62.23, 50).map((r) => r.id)).toEqual(['a'])
    expect(within(rows, -40.55, -62.23, 60).map((r) => r.id)).toEqual(['a', 'b'])
  })
})
