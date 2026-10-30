// Textos y cálculos chicos de la pantalla Pronóstico. Horas siempre en hora local del lugar.
import { parseLocal, formatLocal } from '../lib/time.js'
import { SLOT_MIN } from '../score/config.js'

export const hhmm = (iso) => iso.slice(11, 16)
export const dec = (v, d = 1) => v.toFixed(d).replace('.', ',')

export function tripDays(start, end) {
  const out = []
  for (let m = parseLocal(start + 'T00:00'); m <= parseLocal(end + 'T00:00'); m += 1440) out.push(formatLocal(m).slice(0, 10))
  return out
}

// "Ahora" del lugar: instante real + utc_offset_seconds, nunca la zona del teléfono.
export const nowLocal = (nowMs, utcOffsetSeconds) => formatLocal(Math.floor((nowMs + utcOffsetSeconds * 1000) / 60000))

export const pickDay = (days, today) => (days.includes(today) ? today : days[0])

const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export const dayLabel = (iso) => `${WD[new Date(iso + 'T00:00Z').getUTCDay()]} ${+iso.slice(8)}`

export function countdown(nowIso, start, end) {
  const n = parseLocal(nowIso)
  if (n >= parseLocal(end)) return 'ya pasó'
  const d = parseLocal(start) - n
  if (d <= 0) return 'ahora'
  const h = Math.floor(d / 60), m = d % 60
  return 'en ' + [h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')
}

const slotEnd = (s) => formatLocal(parseLocal(s.t) + SLOT_MIN)

export const slotNow = (slots, nowIso) => slots.find((s) => s.t <= nowIso && nowIso < slotEnd(s))

export function noGoRanges(slots) {
  const out = []
  let start = null
  slots.forEach((s, i) => {
    if (!s.noGo) return
    start ??= s.t
    if (!slots[i + 1]?.noGo) out.push(`${hhmm(start)}–${hhmm(slotEnd(s))}`), (start = null)
  })
  return out
}

// Ventanas para el titular: hoy, las que ya terminaron no se muestran (orden por puntaje intacto).
// Hoy y todas terminadas → [] (la pantalla dice que ya pasaron).
export const heroWindows = (windows, nowIso, isToday) => (isToday ? windows.filter((w) => w.end > nowIso) : windows)

// spec §3.1: el horizonte es el último dato de marea no nulo.
export const tideReaches = (forecast, day) => !!forecast.lastTideT && forecast.lastTideT.slice(0, 10) >= day

export const phaseLabel = (p) =>
  p ? `${p.rising ? 'creciente' : 'bajante'}, ${p.next.type === 'high' ? 'pleamar' : 'bajamar'} ${hhmm(p.next.t)}` : null
