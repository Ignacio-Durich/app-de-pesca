import { parseLocal, formatLocal } from '../lib/time.js'
import { tidePhaseAt } from '../forecast/tides.js'
import { MODELS } from '../forecast/fetch.js'
import { moonDay } from './moon.js'
import {
  WEIGHTS, TIDE, WIND, MOON, LIGHT, SLOT_MIN,
  SCORE_MAX, WAVE_NOGO_M, NOGO_WIND_KMH, UNCERTAIN_KMH, NIGHT_CAP,
} from './config.js'

export function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

// Media circular en grados [0, 360); null si no hay valores.
export function circularMean(degs) {
  const v = degs.filter((x) => x != null)
  if (!v.length) return null
  const r = Math.PI / 180
  const s = v.reduce((a, d) => a + Math.sin(d * r), 0)
  const c = v.reduce((a, d) => a + Math.cos(d * r), 0)
  return ((Math.atan2(s, c) / r) % 360 + 360) % 360
}

// Las bandas de spec §4 se superponen; precedencia: bajamar > pico > 1–2 h tras pleamar > creciente > bajante.
export function tideFactor(phase, mode) {
  if (!phase) return null
  const { sincePrevMin: since, toNextMin: to, prev, next } = phase
  if (mode === 'embarcado') {
    const T = TIDE.embarcado
    const d = Math.min(since, to)
    return d <= T.slackMin ? T.slack : d <= T.nearMin ? T.near : T.mid
  }
  const T = TIDE.costa
  if ((prev.type === 'low' && since <= T.nearLowMin) || (next.type === 'low' && to <= T.nearLowMin)) return T.nearLow
  if (phase.rising) return to <= T.peakBeforeHighMin ? T.peak : T.rising
  if (since <= T.peakAfterHighMin) return T.peak
  if (since <= T.afterHighMin) return T.afterHigh
  return T.falling
}

export const effectiveWind = (wind, gust) => (wind == null ? null : Math.max(wind, WIND.GUST_RATIO * (gust ?? wind)))

export function windFactor(windKmh, gustKmh, waveM, mode) {
  if (mode === 'embarcado' && waveM != null && waveM > WAVE_NOGO_M) return 0
  const eff = effectiveWind(windKmh, gustKmh)
  if (eff == null) return null
  return WIND[mode].find(([max]) => eff <= max)?.[1] ?? 0
}

export function moonFactor(tMin, moon) {
  const near = (k, win) => moon[k] != null && Math.abs(tMin - parseLocal(moon[k])) <= win
  let f = MOON.base
  if (near('transit', MOON.transitMin) || near('lowerTransit', MOON.transitMin)) f += MOON.transit
  if (near('rise', MOON.riseSetMin) || near('set', MOON.riseSetMin)) f += MOON.riseSet
  if (moon.fraction < MOON.newBelow || moon.fraction > MOON.fullAbove) f += MOON.phase
  return Math.min(MOON.max, f)
}

// Corrige el error de punto flotante antes de redondear (0,75 da 7,4999999 y no 7,5). No es un valor de diseño.
const FLOAT_EPS = 1e-9

// Puntaje 0–SCORE_MAX de los factores no nulos (los pesos se renormalizan, R10).
// Sin marea ni viento no hay puntaje: la luna sola (día sin datos horarios) no es un pronóstico.
export function baseScore(factors) {
  if (factors.tide == null && factors.wind == null) return null
  let num = 0, den = 0
  for (const [k, w] of Object.entries(WEIGHTS)) if (factors[k] != null) (num += w * factors[k]), (den += w)
  return den ? Math.round((SCORE_MAX * num) / den + FLOAT_EPS) : null
}

// Slots cada SLOT_MIN del día local. Viento: por modelo se calcula max(medio, 0.7·ráfaga) y se toma
// la mediana; ese valor ya incluye la ráfaga, así que se pasa a windFactor con gust = null.
export function scoreDay(forecast, extremes, dateIso, mode, { nightFishing }) {
  const byT = new Map(forecast.hours.map((h) => [h.t, h]))
  const hourAt = (m) => byT.get(formatLocal(m))
  // valor en la hora exacta, o combinación de las dos horas vecinas (null si falta alguna)
  const at = (m, get, mix = (a, b) => (a + b) / 2) => {
    const off = m % 60
    if (!off) return get(hourAt(m)) ?? null
    const a = get(hourAt(m - off)), b = get(hourAt(m - off + 60))
    return a == null || b == null ? null : mix(a, b)
  }
  const models = Object.keys(MODELS)
  const moon = moonDay(dateIso, forecast.lat, forecast.lon, forecast.utcOffsetSeconds)
  const sun = forecast.days?.[dateIso] ?? {}
  const sunrise = sun.sunrise ? parseLocal(sun.sunrise) : null
  const sunset = sun.sunset ? parseLocal(sun.sunset) : null
  const day0 = parseLocal(dateIso + 'T00:00')

  const slots = []
  for (let m = day0; m < day0 + 24 * 60; m += SLOT_MIN) {
    const effs = models
      .map((k) => effectiveWind(at(m, (h) => h?.wind[k]), at(m, (h) => h?.gust[k])))
      .filter((x) => x != null)
    const windKmh = median(effs)
    // Viento medio (sin ráfagas) solo para mostrar en el motivo; el puntaje y noGo usan el efectivo (R5).
    const meanKmh = median(models.map((k) => at(m, (h) => h?.wind[k])))
    const wave = at(m, (h) => h?.wave)
    const rain = median(models.map((k) => at(m, (h) => h?.rain[k])))
    const phase = tidePhaseAt(m, extremes)
    const factors = {
      tide: tideFactor(phase, mode),
      wind: windFactor(windKmh, null, wave, mode),
      moon: moonFactor(m, moon),
      weather: rain == null ? null : 1 - rain / 100,
    }

    const night = sunrise != null && sunset != null && (m < sunrise || m >= sunset)
    const edge = sunrise != null && sunset != null &&
      ((m >= sunrise && m < sunrise + LIGHT.edgeMin) || (m >= sunset - LIGHT.edgeMin && m < sunset))
    let score = baseScore(factors)
    if (score != null) {
      if (edge) score = Math.min(SCORE_MAX, score + LIGHT.edgeBonus)
      if (night && !nightFishing) score = Math.min(NIGHT_CAP, score)
    }
    const dir = models.map((k) => at(m, (h) => h?.dir[k], (a, b) => circularMean([a, b])))
    slots.push({
      t: formatLocal(m),
      score,
      factors,
      night,
      noGo: mode === 'embarcado' && !night && ((windKmh ?? 0) > NOGO_WIND_KMH || (wave ?? 0) > WAVE_NOGO_M),
      uncertain: effs.length >= 2 && Math.max(...effs) - Math.min(...effs) > UNCERTAIN_KMH,
      windKmh: windKmh == null ? null : Math.round(windKmh * 10) / 10,
      meanKmh: meanKmh == null ? null : Math.round(meanKmh * 10) / 10,
      dirDeg: circularMean(dir),
      phase, // para el motivo de las ventanas
    })
  }
  return slots
}
