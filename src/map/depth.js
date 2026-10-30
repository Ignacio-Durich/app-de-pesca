// Profundidad desde las teselas terrarium que guardó "Preparar viaje" (spec §2.3, §3.1). Nunca pide a la red.
import { lon2x, lat2y, depthTileUrl } from './tiles.js'
import { DEPTH_ZMAX } from '../prepare/prepare.js'

// spec §3.1: alt = R·256 + G + B/256 − 32768 (m; negativo = bajo el nivel del mar).
export const decodeTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768

// spec §2.3: el sondeo se refiere al mismo nivel descontando la marea. Redondeo al cm: la sonda no
// mide más fino y así 8,5 − 1,2 da 7,3 y no 7,300000000000001. Sin marea: null (queda lo medido).
export const soundingDatum = (measuredM, tideHeightM) =>
  tideHeightM == null ? null : Math.round((measuredM - tideHeightM) * 100) / 100

// [diseño] spec §2.3: bandas cada 5 m entre 0 y 60 m; la última junta todo lo de más de 60 m.
export const BAND_M = 5
export const BANDS = 13
export const depthBand = (alt) => (alt >= 0 ? null : Math.min(Math.floor(-alt / BAND_M), BANDS - 1))

// [diseño] de celeste claro (poco profundo) a azul oscuro; alfa para que se vea el mapa base abajo.
const SHALLOW = [190, 230, 245], DEEP = [8, 48, 107]
export const BAND_ALPHA = 150
export const BORDER = [0, 30, 60, 230]
export const bandColor = (b) => SHALLOW.map((c, i) => Math.round(c + ((DEEP[i] - c) * b) / (BANDS - 1)))

// Tesela de zoom z que contiene el punto y el píxel dentro de ella (teselas de `size` px).
export function tilePixel(lat, lon, z, size = 256) {
  const fx = lon2x(lon, z), fy = lat2y(lat, z)
  const x = Math.floor(fx), y = Math.floor(fy)
  return { z, x, y, px: Math.floor((fx - x) * size), py: Math.floor((fy - y) * size) }
}

export const altAt = (img, px, py) => {
  const i = (py * img.width + px) * 4
  return decodeTerrarium(img.data[i], img.data[i + 1], img.data[i + 2])
}

// PNG -> píxeles crudos. Sin conversión de color: los valores RGB son datos, no color.
async function decodePng(res) {
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, bmp.width, bmp.height)
}

// [diseño] teselas decodificadas en memoria (~256 KB c/u): la capa y los toques reusan las mismas.
export const TILE_MEMO = 64
const memos = new WeakMap() // cache -> Map(url -> Promise<ImageData|null>), en orden de uso

// La tesela de la caché decodificada, o null si no está. Lo que no está no se recuerda: si
// "Preparar viaje" la baja después, aparece sin recargar.
export function cachedTile(cache, url, decode = decodePng) {
  if (!memos.has(cache)) memos.set(cache, new Map())
  const memo = memos.get(cache)
  let p = memo.get(url)
  if (p) memo.delete(url)
  else {
    p = cache.match(url, { ignoreVary: true })
      .then((r) => (r ? decode(r) : null))
      .catch(() => null)
      .then((img) => (img || memo.delete(url), img))
  }
  memo.set(url, p)
  if (memo.size > TILE_MEMO) memo.delete(memo.keys().next().value)
  return p
}

// Altura (m, negativa) en el punto según la tesela z12 cacheada. null si no está o da ≥ 0:
// en la bahía ETOPO1 da 0 o valores de tierra (spec §2.3) y la pantalla muestra "sin dato".
export async function depthAt(lat, lon, cache, decode) {
  const t = tilePixel(lat, lon, DEPTH_ZMAX)
  const img = await cachedTile(cache, depthTileUrl(t), decode)
  if (!img) return null
  const { px, py } = tilePixel(lat, lon, DEPTH_ZMAX, img.width)
  const alt = altAt(img, px, py)
  return alt < 0 ? alt : null
}
