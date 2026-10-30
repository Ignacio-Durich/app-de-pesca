// Teselas slippy-map (Web Mercator) y profundidad terrarium de AWS Open Data (spec §3.1).
const R = 6371.0088 // km, radio medio terrestre (igual que nav.js)

export const DEPTH_CACHE = 'depth-v1'
export const depthTileUrl = ({ z, x, y }) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}
const clamp = (v, z) => Math.min(2 ** z - 1, Math.max(0, Math.floor(v)))

// ponytail: no cruza el antimeridiano (lon ±180); alcanza para Argentina.
// Todas las teselas de zMin..zMax que tocan el cuadrado de lado 2·radio centrado en el punto.
export function tilesInRadius(lat, lon, radiusKm, zMin, zMax) {
  const dLat = (radiusKm / R) * (180 / Math.PI)
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  const out = []
  for (let z = zMin; z <= zMax; z++) {
    const x0 = clamp(lon2x(lon - dLon, z), z), x1 = clamp(lon2x(lon + dLon, z), z)
    const y0 = clamp(lat2y(lat + dLat, z), z), y1 = clamp(lat2y(lat - dLat, z), z)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y })
  }
  return out
}
