// Genera src/data/zones.json (spec §8.4): límites provinciales de OSM (admin_level 4) de Buenos Aires y
// Entre Ríos, recortados al bbox de la región `lima` y simplificados. Se corre a mano una vez:
//   node scripts/zones.mjs
// La app no usa este script; solo lee el JSON.
import { writeFileSync } from 'node:fs'

const BBOX = [-60.34, -34.87, -58.18, -33.07] // [oeste, sur, este, norte], región `lima` (spec §8.5)
const RELS = { ba: 1632167, er: 153551 } // OSM: Buenos Aires (AR-B), Entre Ríos (AR-E)
const TOL_DEG = 0.0002 // simplificación Douglas–Peucker, ~20 m
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const QUERY = `[out:json][timeout:180];rel(id:${Object.values(RELS).join(',')});out geom;`

async function overpass() {
  for (let i = 0; i < 6; i++) {
    const url = ENDPOINTS[i % ENDPOINTS.length]
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'pesca-app-zones/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(QUERY),
      })
      if (r.ok) return { json: await r.json(), url }
      console.error(`${url}: HTTP ${r.status}`)
    } catch (e) { console.error(`${url}: ${e.message}`) }
    await new Promise((ok) => setTimeout(ok, 10_000 * (i + 1)))
  }
  throw new Error('Overpass no respondió')
}

const key = (p) => `${p[0]},${p[1]}`

// Une los ways de un rol en anillos cerrados, empalmando por los extremos.
function rings(ways) {
  const left = ways.map((w) => w.geometry.map((g) => [g.lon, g.lat]))
  const out = []
  while (left.length) {
    let ring = left.shift()
    while (key(ring[0]) !== key(ring.at(-1))) {
      const end = key(ring.at(-1))
      const i = left.findIndex((w) => key(w[0]) === end || key(w.at(-1)) === end)
      if (i < 0) throw new Error('anillo abierto')
      const w = left.splice(i, 1)[0]
      ring = ring.concat((key(w[0]) === end ? w : w.reverse()).slice(1))
    }
    out.push(ring)
  }
  return out
}

// Sutherland–Hodgman contra el rectángulo (convexo): sirve para cualquier anillo.
function clip(ring, [w, s, e, n]) {
  const edges = [
    [(p) => p[0] >= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n]],
  ]
  let pts = ring.slice(0, -1)
  for (const [inside, cut] of edges) {
    const res = []
    pts.forEach((b, i) => {
      const a = pts[(i + pts.length - 1) % pts.length]
      if (inside(b)) { if (!inside(a)) res.push(cut(a, b)); res.push(b) }
      else if (inside(a)) res.push(cut(a, b))
    })
    pts = res
    if (!pts.length) return null
  }
  return [...pts, pts[0]]
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts.at(-1)]
  let max = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    const d = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(p[0] - a[0], p[1] - a[1])
    if (d > max) { max = d; idx = i }
  }
  if (max <= tol) return [a, b]
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol))
}

const round = (r) => r.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)])
const date = new Date().toISOString().slice(0, 10)

const { json, url } = await overpass()
const zones = []
for (const [id, relId] of Object.entries(RELS)) {
  const rel = json.elements.find((e) => e.type === 'relation' && e.id === relId)
  const ways = rel.members.filter((m) => m.type === 'way' && m.geometry)
  const source = `OSM relación ${relId} (${rel.tags.name}, admin_level 4), © OpenStreetMap contributors, ODbL. Descargado de ${url} el ${date}; recortado al bbox ${BBOX.join(', ')} y simplificado (~20 m).`
  const holes = rings(ways.filter((m) => m.role === 'inner')).map((r) => clip(r, BBOX)).filter(Boolean)
  for (const outer of rings(ways.filter((m) => m.role !== 'inner'))) {
    const c = clip(outer, BBOX)
    if (!c) continue
    const z = { id, name: rel.tags.name, bbox: BBOX, polygon: round(simplify(c, TOL_DEG)), source }
    if (holes.length) z.holes = holes.map((h) => round(simplify(h, TOL_DEG)))
    zones.push(z)
  }
}
writeFileSync(new URL('../src/data/zones.json', import.meta.url), JSON.stringify(zones) + '\n')
for (const z of zones) console.log(z.id, z.polygon.length, 'puntos', z.holes ? `${z.holes.length} huecos` : '')
