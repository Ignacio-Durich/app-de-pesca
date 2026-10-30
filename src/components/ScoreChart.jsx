// Curva de marea + ventanas + noche + barras de puntaje por hora + capturas. SVG a mano (sin librería).
import { parseLocal } from '../lib/time.js'
import { hhmm, dec } from '../forecast/view.js'
import { SCORE_MAX, WINDOW_MIN } from '../score/config.js'

const W = 360, PAD = 8, TOP = 22, TIDE_H = 110, GAP = 10, BAR_H = 50, AXIS = 14
const H = TOP + TIDE_H + GAP + BAR_H + AXIS

export function ScoreChart({ day, hours, extremes, windows, slots, sun, catches = [] }) {
  const day0 = parseLocal(day + 'T00:00')
  const x = (iso) => PAD + ((parseLocal(iso) - day0) / 1440) * (W - 2 * PAD)
  const step = (W - 2 * PAD) / 24

  const levels = [...hours.map((h) => h.sea), ...extremes.map((e) => e.h)].filter((v) => v != null)
  const lo = Math.min(...levels), hi = Math.max(...levels)
  const y = (v) => TOP + (hi === lo ? TIDE_H / 2 : ((hi - v) / (hi - lo)) * TIDE_H)
  let path = '', pen = false
  for (const h of hours) {
    if (h.sea == null) { pen = false; continue }
    path += `${pen ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(h.sea).toFixed(1)}`
    pen = true
  }

  const barTop = TOP + TIDE_H + GAP
  const perHour = Array.from({ length: 24 }, (_, i) => {
    const s = [slots[2 * i]?.score, slots[2 * i + 1]?.score].filter((v) => v != null)
    return s.length ? Math.max(...s) : null
  })

  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Marea y puntaje por hora">
      {sun?.sunrise && <rect class="sc-night" x={PAD} y={0} width={x(sun.sunrise) - PAD} height={barTop + BAR_H} />}
      {sun?.sunset && <rect class="sc-night" x={x(sun.sunset)} y={0} width={W - PAD - x(sun.sunset)} height={barTop + BAR_H} />}
      {windows.filter((w) => !w.weak).map((w) => (
        <rect key={w.start} class="sc-win" x={x(w.start)} y={0} width={x(w.end) - x(w.start)} height={barTop + BAR_H} />
      ))}
      {path && <path class="sc-tide" d={path} />}
      {extremes.map((e) => {
        const cx = x(e.t), cy = y(e.h), up = e.type === 'high'
        const anchor = cx < 30 ? 'start' : cx > W - 30 ? 'end' : 'middle'
        return (
          <g key={e.t}>
            <circle class="sc-ext" cx={cx} cy={cy} r={3} />
            <text class="sc-label" x={cx} y={up ? cy - 7 : cy + 13} text-anchor={anchor}>
              {hhmm(e.t)} · {dec(e.h)} m
            </text>
          </g>
        )
      })}
      {perHour.map((s, i) => s != null && (
        <rect key={i} class={s >= WINDOW_MIN ? 'sc-bar good' : 'sc-bar'}
          x={PAD + i * step + 1} y={barTop + BAR_H * (1 - s / SCORE_MAX)} width={step - 2} height={(BAR_H * s) / SCORE_MAX} />
      ))}
      {catches.map((t, i) => (
        <circle key={i} class="sc-catch" cx={x(t)} cy={barTop - GAP / 2} r={3}><title>Captura {hhmm(t)}</title></circle>
      ))}
      <line class="sc-axis" x1={PAD} x2={W - PAD} y1={barTop + BAR_H} y2={barTop + BAR_H} />
      {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
        <text key={h} class="sc-label" x={PAD + h * step} y={H - 2}>{String(h).padStart(2, '0')}</text>
      ))}
    </svg>
  )
}
