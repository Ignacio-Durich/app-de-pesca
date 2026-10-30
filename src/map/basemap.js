// Mapa base offline (spec §3.1): el .pmtiles de la región se baja entero y se guarda en IndexedDB.
import regions from '../data/regions.json'
import { localGet, localSet } from '../lib/local.js'

export { regions }
export const regionKey = (region) => `region:${region.id}`

// regions.json guarda solo el nombre del archivo; la base (R2) viene del entorno. Sin base: null.
export const regionUrl = (region, base = import.meta.env.VITE_MAP_BASE_URL) =>
  base ? `${base.replace(/\/$/, '')}/${region.file}` : null

export const regionFor = (lat, lon) =>
  regions.find(({ bbox: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n) ?? null

// ponytail: si se corta a mitad, la próxima vez baja el archivo de nuevo; usar Range si las regiones crecen.
export async function downloadRegion(region, onProgress = () => {}, { fetch: fetchImpl = fetch, set = localSet, baseUrl } = {}) {
  const res = await fetchImpl(regionUrl(region, baseUrl))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!res.body) return set(regionKey(region), await res.blob())
  const total = Number(res.headers.get('content-length')) || region.bytes || 0
  const parts = []
  let done = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done: end, value } = await reader.read()
    if (end) break
    parts.push(value)
    done += value.length
    onProgress({ done, total })
  }
  await set(regionKey(region), new Blob(parts))
}

// Capa Leaflet desde el .pmtiles guardado; null si todavía no se bajó.
// API verificada en protomaps-leaflet 5.1.0 instalado:
// - src/frontends/leaflet.ts: `LeafletLayerOptions.url?: PMTiles | string`, y la clase hace
//   `extends L.GridLayer` con un `L` global (`declare const L: any`) → hay que definir window.L antes.
// - src/view.ts `sourcesToViews`: si `url` no es string usa `new PmtilesSource(url)` (src/tilecache.ts),
//   que solo llama `p.getZxy(z, x, y, signal)`.
// pmtiles quedó en ^3.2.1, la misma que pide protomaps-leaflet, para que haya una sola copia.
// Imports dinámicos: Leaflet toca `window` al cargarse (rompe en tests) y así sale del bundle inicial.
export async function basemapLayer(region, { get = localGet } = {}) {
  const blob = await get(regionKey(region))
  if (!blob) return null
  const [{ default: L }, { leafletLayer }, { PMTiles, FileSource }] = await Promise.all([
    import('leaflet'), import('protomaps-leaflet'), import('pmtiles'),
  ])
  window.L ??= L
  const archive = new PMTiles(new FileSource(new File([blob], `${region.id}.pmtiles`)))
  return leafletLayer({ url: archive, flavor: 'light', lang: 'es' })
}
