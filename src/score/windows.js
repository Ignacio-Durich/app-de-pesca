import { parseLocal, formatLocal } from '../lib/time.js'
import { TIDE, SLOT_MIN, WINDOW_MIN, MAX_WINDOWS } from './config.js'
import { circularMean } from './score.js'

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

function tidePart(run, mode) {
  const ph = run.map((s) => s.phase).filter(Boolean)
  if (!ph.length) return null
  const start = parseLocal(run[0].t)
  const end = parseLocal(run.at(-1).t) + SLOT_MIN
  // pleamar dentro de la ventana o hasta 2 h después de su fin
  const highs = ph.flatMap((p) => [p.prev, p.next]).filter((e) => e.type === 'high').map((e) => parseLocal(e.t))
  if (highs.some((h) => h >= start && h <= end + TIDE.costa.peakBeforeHighMin)) return 'fin de creciente + repunte'
  if (mode === 'embarcado' && ph.some((p) => Math.min(p.sincePrevMin, p.toNextMin) <= TIDE.embarcado.slackMin))
    return 'repunte'
  return ph.filter((p) => p.rising).length * 2 >= ph.length ? 'creciente' : 'bajante'
}

function reason(run, mode) {
  const winds = run.map((s) => s.windKmh).filter((x) => x != null)
  const dir = circularMean(run.map((s) => s.dirDeg))
  const parts = [tidePart(run, mode)]
  if (winds.length) {
    const kmh = Math.round(winds.reduce((a, b) => a + b, 0) / winds.length)
    parts.push(`viento ${kmh} km/h` + (dir == null ? '' : ` ${CARDINALS[Math.round(dir / (360 / CARDINALS.length)) % CARDINALS.length]}`))
  }
  return parts.filter(Boolean).join(', ')
}

// Tramos maximales de slots consecutivos que cumplen `ok`.
function runs(slots, ok) {
  const out = []
  let cur = []
  for (const s of slots) {
    if (ok(s)) cur.push(s)
    else if (cur.length) out.push(cur), (cur = [])
  }
  if (cur.length) out.push(cur)
  return out
}

export function findWindows(slots, { nightFishing, mode = 'costa' }) {
  const eligible = (s) => s.score != null && (nightFishing || !s.night)
  let found = runs(slots, (s) => eligible(s) && s.score >= WINDOW_MIN)
  let weak = false
  if (!found.length) {
    const scores = slots.filter(eligible).map((s) => s.score)
    if (!scores.length) return []
    const best = Math.max(...scores)
    found = runs(slots, (s) => eligible(s) && s.score === best).slice(0, 1)
    weak = true
  }
  return found
    .map((run) => ({
      start: run[0].t,
      end: formatLocal(parseLocal(run.at(-1).t) + SLOT_MIN),
      score: Math.max(...run.map((s) => s.score)),
      reason: reason(run, mode),
      weak,
    }))
    .sort((a, b) => b.score - a.score || (a.start < b.start ? -1 : 1))
    .slice(0, MAX_WINDOWS)
}
