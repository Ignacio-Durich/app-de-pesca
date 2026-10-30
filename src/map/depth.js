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
// [diseño] R22: ETOPO1 no tiene detalle en la bahía (spec §2.3); lo que decodifica a menos de 1 m
// (p. ej. −0,0078) es ruido alrededor de 0 y se trata como sin dato, no como "0,0 m".
export const MIN_DEPTH_M = 1
export const depthBand = (alt) => (alt > -MIN_DEPTH_M ? null : Math.min(Math.floor(-alt / BAND_M), BANDS - 1))

// [diseño] escala YlGnBu de ColorBrewer (9 clases, colorbrewer2.org): de amarillo verdoso (poco profundo) a azul
// oscuro, cambiando de tono para que bandas vecinas se distingan; las 13 bandas se interpolan entre esos 9 colores.
// Alfa para que se vea el mapa base abajo.
const YLGNBU = [[255, 255, 217], [237, 248, 177], [199, 233, 180], [127, 205, 187], [65, 182, 196], [29, 145, 192], [34, 94, 168], [37, 52, 148], [8, 29, 88]]
export const BAND_ALPHA = 180
export const BORDER = [0, 30, 60, 230]
export function bandColor(b) {
  const f = (b * (YLGNBU.length - 1)) / (BANDS - 1), i = Math.min(Math.floor(f), YLGNBU.length - 2), t = f - i
  return YLGNBU[i].map((c, k) => Math.round(c + (YLGNBU[i + 1][k] - c) * t))
}

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

// Altura interpolada entre los 4 píxeles vecinos; fx, fy en píxeles con decimales (el centro del
// píxel i está en i + 0,5). Al agrandar la tesela no salen escalones. En el borde repite el último píxel.
export const altAtF = (img, fx, fy) => {
  const gx = fx - 0.5, gy = fy - 0.5, ix = Math.floor(gx), iy = Math.floor(gy)
  const cx = (v) => Math.min(Math.max(v, 0), img.width - 1), cy = (v) => Math.min(Math.max(v, 0), img.height - 1)
  const x0 = cx(ix), x1 = cx(ix + 1), y0 = cy(iy), y1 = cy(iy + 1), tx = gx - ix, ty = gy - iy
  const top = altAt(img, x0, y0) * (1 - tx) + altAt(img, x1, y0) * tx
  const bot = altAt(img, x0, y1) * (1 - tx) + altAt(img, x1, y1) * tx
  return top * (1 - ty) + bot * ty
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

// Altura (m, negativa) en el punto según la tesela DEPTH_ZMAX cacheada. null si no está o no llega a MIN_DEPTH_M:
// en la bahía ETOPO1 da 0 o valores de tierra (spec §2.3) y la pantalla muestra "sin dato".
export async function depthAt(lat, lon, cache, decode) {
  const t = tilePixel(lat, lon, DEPTH_ZMAX)
  const img = await cachedTile(cache, depthTileUrl(t), decode)
  if (!img) return null
  const { px, py } = tilePixel(lat, lon, DEPTH_ZMAX, img.width)
  const alt = altAt(img, px, py)
  return alt <= -MIN_DEPTH_M ? alt : null
}
