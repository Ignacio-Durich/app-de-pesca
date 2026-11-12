// Puntaje de pesqueros (spec §8.6): módulo puro, sin red ni IndexedDB. Todo se calcula con lo guardado.
import { parseLocal, formatLocal, fromInstant } from '../lib/time.js'
import { findExtremes } from '../forecast/tides.js'
import { phaseNameAt } from '../catches/conditions.js'
import { distanceBearing, within, zoneRadiusKm } from '../map/nav.js'
import { dec, riverLine } from '../forecast/view.js'
import { trendCmPerDay } from './river.js'
import { scoreDay } from './score.js'
import { findWindows } from './windows.js'
import { SPOT, ATUCHA, SCORE_MAX } from './config.js'

const hhmm = (iso) => iso.slice(11, 16)
// Fecha local del viaje (UTC−3), no la UTC: una captura de las 23:00 queda en su día.
const dmy = (iso) => { const { date } = fromInstant(iso); return `${+date.slice(8, 10)}/${+date.slice(5, 7)}/${date.slice(0, 4)}` }

// Altura del agua a la hora t: la de la hora exacta o la media de las dos vecinas (null si falta alguna).
function seaAt(forecast, t) {
  const m = parseLocal(t)
  const byT = new Map(forecast.hours.map((h) => [h.t, h.sea]))
  const off = m % 60
  const a = byT.get(formatLocal(m - off)) ?? null
  if (!off) return a
  const b = byT.get(formatLocal(m - off + 60)) ?? null
  return a == null || b == null ? null : (a + b) / 2
}

// Fuente citada y aviso de la central (no cambian el puntaje)
function withTail(lines, spot) {
  if (spot.source) lines.push({ text: `Fuente: ${spot.source}`, origin: 'fuente' })
  if (distanceBearing(ATUCHA.lat, ATUCHA.lon, spot.lat, spot.lon).km <= SPOT.centralKm)
    lines.push({ text: 'zona de la central: verificar si se puede pescar', origin: 'aviso' })
  return lines
}

function rankOne({ spot, catches, slots, extremes, forecast, mode, water, nightFishing, from, day }) {
  const lines = []
  const rio = water === 'rio'
  const km = from ? distanceBearing(from.lat, from.lon, spot.lat, spot.lon).km : null

  // 1. Base: la mejor hora elegible, solo en la fase de marea del pesquero si la tiene
  // La regla se aplica solo si ese día hay altura (alguna hora con fase); más allá del pronóstico de altura, no.
  let use = slots
  const phases = spot.best_tide ? slots.map((s) => phaseNameAt(parseLocal(s.t), extremes)) : []
  const ruled = phases.some((p) => p != null)
  if (ruled) {
    use = slots.map((s, i) => (phases[i] === spot.best_tide ? s : { ...s, score: null }))
  } else if (spot.best_tide) {
    lines.push({ text: 'sin altura para aplicar la regla', origin: 'aviso' })
  }
  const note = rio && forecast.level ? riverLine(trendCmPerDay(forecast.level.points, day)) : undefined
  const eligible = use.filter((s) => s.score != null && !s.noGo && (nightFishing || !s.night))
  let best = null
  for (const s of eligible) if (!best || s.score > best.score) best = s // empate: la más temprana

  if (!best) {
    // spec §8.6: con best_tide y sin horas en esa fase, "hoy no le da el agua"
    // "hoy no le da el agua" solo si ningún slot cae en esa fase; si los hay pero no sirven (noGo, noche) es otro motivo
    const noWater = ruled && !use.some((s) => s.score != null)
    // [diseño] sin copia en la spec
    lines.push({ text: noWater ? 'hoy no le da el agua' : 'ninguna hora sirve hoy (no conviene salir)', origin: 'diseño' })
    return { spot, score: 0, best: null, km, lines: withTail(lines, spot) }
  }
  const window = findWindows(use, { nightFishing, mode, note: note ?? undefined }).find((w) => w.start <= best.t && best.t < w.end) ?? null
  lines.unshift({
    text: window
      ? `Ventana ${hhmm(window.start)}–${hhmm(window.end)} · ${best.score}/10 · ${window.reason}`
      : `Mejor hora ${hhmm(best.t)} · ${best.score}/10`, // [diseño] sin copia en la spec
    origin: 'diseño',
  })
  let score = Math.round(best.score)
  const h = rio && forecast.level ? seaAt(forecast, best.t) : null

  // 2. Altura (solo río, con rango cargado)
  const { best_level_min_m: lo, best_level_max_m: hi } = spot
  if (rio && (lo != null || hi != null)) {
    const range = lo != null && hi != null ? `${dec(lo)}–${dec(hi)} m` : lo != null ? `desde ${dec(lo)} m` : `hasta ${dec(hi)} m`
    if (h == null) lines.push({ text: 'sin pronóstico de altura', origin: 'aviso' })
    else if ((lo != null && h < lo) || (hi != null && h > hi)) {
      score -= SPOT.outOfRangePenalty
      lines.push({ text: `Altura prevista ${dec(h)} m, fuera del rango que cargaron (${range}): −${SPOT.outOfRangePenalty}`, origin: 'diseño' }) // [diseño] sin copia en la spec
    } else lines.push({ text: `Altura prevista ${dec(h)} m, dentro del rango que cargaron (${range})`, origin: 'diseño' })
  }

  // 3. Lo que pescó el grupo a ≤ radiusM con condiciones parecidas a las de la mejor hora
  const phase = rio ? null : phaseNameAt(parseLocal(best.t), extremes)
  const similar = catches.filter((c) => {
    if (c.lat == null || c.lon == null) return false
    if (distanceBearing(spot.lat, spot.lon, c.lat, c.lon).km * 1000 > SPOT.radiusM) return false
    if (rio) return h != null && c.level_source === forecast.level.source && c.tide_height_m != null && Math.abs(c.tide_height_m - h) <= SPOT.levelSimilarM
    return phase != null && c.tide_phase === phase
  })
  if (similar.length) {
    score += similar.length >= SPOT.manyFrom ? SPOT.historyMany : SPOT.historyOne
    const by = {}
    for (const c of similar) by[c.species ?? 'capturas'] = (by[c.species ?? 'capturas'] ?? 0) + 1
    const what = Object.entries(by).map(([sp, n]) => `${n} ${sp}`).join(', ')
    const hs = similar.map((c) => c.tide_height_m)
    const cond = rio ? ` con el río entre ${dec(Math.min(...hs))} y ${dec(Math.max(...hs))} m` : ` con ${phase}` // [diseño] sin copia en la spec (variante de mar)
    const last = similar.map((c) => c.caught_at).sort().at(-1)
    lines.push({ text: `El grupo sacó ${what} acá${cond} (última: ${dmy(last)})`, origin: 'grupo' })
  } else lines.push({ text: 'sin capturas del grupo todavía', origin: 'grupo' })

  return { spot, score: Math.max(0, Math.min(SCORE_MAX, score)), best: { t: best.t, window }, km, lines: withTail(lines, spot) }
}

// Capturas del viaje (las de recién) + la copia de "Preparar viaje", sin repetir. Misma captura = mismo instante
// y lugar: el servidor devuelve UTC y lo local puede venir con -03:00, por eso se compara el instante.
export function mergeCatches(near = [], own = []) {
  const k = (c) => `${Date.parse(c.caught_at)}|${c.lat}|${c.lon}`
  const seen = new Set(own.map(k))
  return [...own, ...near.filter((c) => !seen.has(k(c)))]
}

// `from` (opcional): lugar desde el que se mide `km`; por defecto forecast.lat/lon (el lugar del viaje).
export function rankSpots({ spots, catches = [], slots, extremes, forecast, mode, water = 'mar', nightFishing, from, day }) {
  const origin = from ?? (forecast.lat != null && forecast.lon != null ? { lat: forecast.lat, lon: forecast.lon } : null)
  return spots
    .filter((s) => s.access == null || s.access === 'ambos' || s.access === mode)
    .map((spot) => rankOne({ spot, catches, slots, extremes, forecast, mode, water, nightFishing, from: origin, day: day ?? slots[0]?.t.slice(0, 10) }))
    .sort((a, b) => b.score - a.score || (a.km ?? 0) - (b.km ?? 0))
}

export function rankForTrip(trip, forecast, spots, catches, mode, day) {
  const water = trip.water ?? 'mar'
  const nightFishing = !!trip.night_fishing
  const extremes = findExtremes(forecast.hours)
  const slots = scoreDay(forecast, extremes, day, mode, { nightFishing, water })
  const near = within(spots, trip.lat, trip.lon, zoneRadiusKm(trip))
  return rankSpots({ spots: near, catches, slots, extremes, forecast, mode, water, nightFishing, day, from: { lat: trip.lat, lon: trip.lon } })
}
