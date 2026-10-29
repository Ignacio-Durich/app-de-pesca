import { parseLocal, formatLocal } from '../lib/time.js'

// Extremos de marea desde nivel del mar horario (nulls ignorados).
// Un punto es extremo si supera/queda bajo a sus vecinos no nulos, y esos vecinos
// están a 60 min (así el ajuste parabólico es válido; junto a un hueco no se detecta).
export function findExtremes(series) {
  const pts = series.filter((p) => p.sea != null).map((p) => ({ m: parseLocal(p.t), y: p.sea }))
  const out = []
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1]
    if (b.m - a.m !== 60 || c.m - b.m !== 60) continue
    const type = b.y > a.y && b.y >= c.y ? 'high' : b.y < a.y && b.y <= c.y ? 'low' : null
    if (!type) continue
    // Vértice de la parábola por (-60,a.y), (0,b.y), (60,c.y).
    const den = a.y - 2 * b.y + c.y
    const off = den === 0 ? 0 : (30 * (a.y - c.y)) / den
    out.push({ t: formatLocal(Math.round(b.m + off)), h: b.y - ((a.y - c.y) * off) / 240, type })
  }
  return out
}

export function tidePhaseAt(tMin, extremes) {
  const idx = extremes.findIndex((e) => parseLocal(e.t) > tMin)
  if (idx < 1) return null
  const prev = extremes[idx - 1], next = extremes[idx]
  return {
    rising: next.type === 'high',
    sincePrevMin: tMin - parseLocal(prev.t),
    toNextMin: parseLocal(next.t) - tMin,
    prev,
    next,
  }
}
