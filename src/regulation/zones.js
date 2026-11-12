// Zona de reglamento según la posición (spec §8.4): punto en polígono, más las zonas cuyo borde
// queda a ≤ edgeKm (cerca del límite valen las dos). Polígonos de src/data/zones.json ([lon, lat]).
// Ojo, consumidores:
// - zones.json puede tener varias entradas con el mismo id (Buenos Aires: continente + Martín García),
//   cada una con su `polygon`, un `holes` opcional y el `bbox` del recorte. Se agrupa por id, no por entrada.
// - species.json tiene dorado-ba y dorado-er, los dos con name "Dorado": no indexar por name solo, ni
//   suponer un id por especie; la clave es id, y para mostrar, name + zones.
import zonesJson from '../data/zones.json'
import { ZONE_EDGE_KM } from '../score/config.js'

// Ray casting (par/impar).
function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Lados que son el corte del bbox (no un límite real): no cuentan como borde.
const onBbox = (a, b, bbox) => bbox && [0, 1].some((k) => a[k] === b[k] && (a[k] === bbox[k] || a[k] === bbox[k + 2]))

// ponytail: proyección equirectangular centrada en el punto; error despreciable a pocos km, que es lo que importa
// para un umbral de 1 km. Para distancias de cientos de km haría falta geodésica.
function edgeDistKm(lat, lon, ring, bbox) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.574
  const xy = ([x, y]) => [(x - lon) * kx, (y - lat) * ky]
  let min = Infinity
  for (let i = 1; i < ring.length; i++) {
    if (onBbox(ring[i - 1], ring[i], bbox)) continue
    const [ax, ay] = xy(ring[i - 1]), [bx, by] = xy(ring[i])
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return min
}

export function zonesAt(lat, lon, zones = zonesJson, edgeKm = ZONE_EDGE_KM) {
  const hit = new Set()
  for (const z of zones) {
    const rings = [z.polygon, ...(z.holes ?? [])]
    const inside = inRing(lon, lat, z.polygon) && !(z.holes ?? []).some((h) => inRing(lon, lat, h))
    if (inside || rings.some((r) => edgeDistKm(lat, lon, r, z.bbox) <= edgeKm)) hit.add(z.id)
  }
  return [...hit]
}
