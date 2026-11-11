// Condiciones de una captura (spec §2.6), calculadas con el pronóstico guardado: funciona offline.
import { parseLocal, formatLocal } from '../lib/time.js'
import { tidePhaseAt } from '../forecast/tides.js'
import { MODELS } from '../forecast/fetch.js'
import { median, circularMean } from '../score/score.js'

export const SLACK_MIN = 30 // [diseño] a ±30 min de un extremo cuenta como pleamar/bajamar

const NAME = { high: 'pleamar', low: 'bajamar' }

// Fase de la marea a tMin (minutos locales, como parseLocal): pleamar/bajamar a ±SLACK_MIN de un extremo.
export function phaseNameAt(tMin, extremes) {
  const near = extremes.find((e) => Math.abs(parseLocal(e.t) - tMin) <= SLACK_MIN)
  const phase = tidePhaseAt(tMin, extremes)
  return near ? NAME[near.type] : phase ? (phase.rising ? 'creciente' : 'bajante') : null
}

// tLocal: hora local del lugar ('YYYY-MM-DDTHH:MM'). Lo que el pronóstico no cubre queda en null.
export function conditionsAt(forecast, extremes, tLocal) {
  const m = parseLocal(tLocal)
  const byT = new Map(forecast.hours.map((h) => [h.t, h]))
  const off = m % 60
  const a = byT.get(formatLocal(m - off))
  const b = off ? byT.get(formatLocal(m - off + 60)) : a
  const tide_height_m = a?.sea == null || b?.sea == null ? null : a.sea + ((b.sea - a.sea) * off) / 60

  // Viento: valores de la hora más cercana, sin ráfaga (no el viento efectivo del puntaje).
  const h = byT.get(formatLocal(Math.round(m / 60) * 60))
  const models = Object.keys(MODELS)
  const wind_kmh = h ? median(models.map((k) => h.wind[k])) : null
  const wind_dir_deg = h ? circularMean(models.map((k) => h.dir[k])) : null

  // Sin altura, la etiqueta de fuente no significa nada.
  const level_source = tide_height_m == null ? null : forecast.level?.source ?? 'marea'

  return { tide_phase: phaseNameAt(m, extremes), tide_height_m, wind_kmh, wind_dir_deg, level_source }
}
