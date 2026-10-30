// Capa de profundidad (spec §2.3): pinta solo con las teselas cacheadas (offline). Se importa dinámico,
// junto con Leaflet, para que no entre en el bundle inicial.
import L from 'leaflet'
import { depthTileUrl } from './tiles.js'
import { DEPTH_ZMIN, DEPTH_ZMAX } from '../prepare/prepare.js'
import { cachedTile, altAtF, depthBand, bandColor, BAND_ALPHA, BORDER, BANDS } from './depth.js'

const COLORS = Array.from({ length: BANDS }, (_, b) => [...bandColor(b), BAND_ALPHA])

// Más allá de DEPTH_ZMAX se agranda esa tesela con interpolación (spec §3.1). Tierra (y 0 m) transparente; borde de 1 px
// donde cambia la banda (se marca el píxel cuyo vecino de la derecha o de abajo es distinto). [diseño] Contra "sin dato"
// no hay borde: en la bahía ETOPO1 salta celda a celda alrededor de −1 m y dibujaba una grilla de cuadrados.
async function drawTile(canvas, { x, y, z }, cache) {
  const sz = Math.min(z, DEPTH_ZMAX), k = 2 ** (z - sz)
  const img = await cachedTile(cache, depthTileUrl({ z: sz, x: Math.floor(x / k), y: Math.floor(y / k) }))
  if (!img) return
  const W = canvas.width, H = canvas.height
  const sx = img.width / (W * k), sy = img.height / (H * k)
  const ox = ((x % k) * img.width) / k, oy = ((y % k) * img.height) / k
  const bands = new Int8Array(W * H)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      bands[py * W + px] = depthBand(altAtF(img, ox + (px + 0.5) * sx, oy + (py + 0.5) * sy)) ?? -1
    }
  }
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(W, H)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px, b = bands[i]
      const diff = (j) => b >= 0 && bands[j] >= 0 && bands[j] !== b
      const edge = (px + 1 < W && diff(i + 1)) || (py + 1 < H && diff(i + W))
      if (edge) out.data.set(BORDER, i * 4)
      else if (b >= 0) out.data.set(COLORS[b], i * 4)
    }
  }
  ctx.putImageData(out, 0, 0)
}

const DepthLayer = L.GridLayer.extend({
  createTile(coords, done) {
    const canvas = L.DomUtil.create('canvas', 'leaflet-tile')
    const size = this.getTileSize()
    canvas.width = size.x
    canvas.height = size.y
    drawTile(canvas, coords, this.options.cache).then(() => done(null, canvas), (e) => done(e, canvas))
    return canvas
  },
})

// cache: la Cache API abierta en DEPTH_CACHE. Debajo de z8 no hay teselas guardadas.
export const depthLayer = (cache) => new DepthLayer({ cache, minZoom: DEPTH_ZMIN })
