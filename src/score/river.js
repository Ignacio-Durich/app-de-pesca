// Puntaje de río: tendencia del nivel y presión. Puro, sin red ni IndexedDB.
import { parseLocal, formatLocal } from '../lib/time.js'
import { MODELS } from '../forecast/fetch.js'
import { RIVER, PRESSURE } from './config.js'
import { median } from './score.js'

// cm/día entre el mediodía de dateIso y el de trendDays días antes; null si falta alguno.
export function trendCmPerDay(points, dateIso) {
  const at = (t) => points?.find((p) => p.t === t)?.h
  const now = at(dateIso + 'T12:00')
  const before = at(formatLocal(parseLocal(dateIso + 'T12:00') - RIVER.trendDays * 1440))
  return now == null || before == null ? null : ((now - before) / RIVER.trendDays) * 100
}

export function trendFactor(cmDay) {
  if (cmDay == null) return 1
  if (cmDay < -RIVER.fastFallCmDay) return RIVER.fastFall
  if (cmDay > RIVER.strongRiseCmDay) return RIVER.strongRise
  return 1
}

export function trendLabel(cmDay) {
  if (cmDay == null) return null
  return cmDay > RIVER.stableCmDay ? 'creciendo' : cmDay < -RIVER.stableCmDay ? 'bajando' : 'estable'
}

// Mediana de los modelos ahora vs. PRESSURE.hours h antes.
export function pressureFactor(hours, tMin) {
  const p = (m) => {
    const h = hours.find((x) => x.t === formatLocal(m))
    return median(Object.keys(MODELS).map((k) => h?.pressure?.[k]))
  }
  const now = p(tMin), before = p(tMin - PRESSURE.hours * 60)
  if (now == null || before == null) return null
  const d = now - before
  return d <= -PRESSURE.deltaHpa ? PRESSURE.drop : d >= PRESSURE.deltaHpa ? PRESSURE.rise : PRESSURE.stable
}
