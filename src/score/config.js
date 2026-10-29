// [diseño] spec §4: regla aproximada, no datos medidos. Se ajusta con las capturas.
// Todo umbral/peso del puntaje vive acá; ningún otro módulo tiene números mágicos.

export const WEIGHTS = { tide: 0.5, wind: 0.3, moon: 0.1, weather: 0.1 }

// Minutos respecto de los extremos de marea.
export const TIDE = {
  costa: {
    nearLowMin: 60, nearLow: 0.2, // ±1 h de la bajamar
    peakBeforeHighMin: 120, peakAfterHighMin: 60, peak: 1.0, // últimas 2 h de creciente y hasta 1 h después de la pleamar
    afterHighMin: 120, afterHigh: 0.5, // de 1 a 2 h después de la pleamar
    rising: 0.7, // resto de la creciente
    falling: 0.25, // bajante
  },
  embarcado: {
    slackMin: 60, slack: 1.0, // ±1 h de cualquier extremo (repunte)
    nearMin: 120, near: 0.6, // de 1 a 2 h del extremo
    mid: 0.2, // mitad de la marea
  },
}

// km/h. Viento efectivo = max(medio, GUST_RATIO·ráfaga). [hasta km/h, factor]; por encima del último → 0.
export const WIND = {
  GUST_RATIO: 0.7,
  costa: [[15, 1.0], [25, 0.6], [35, 0.2]],
  embarcado: [[12, 1.0], [20, 0.6], [25, 0.3]],
}

export const MOON = {
  base: 0.3,
  transitMin: 60, transit: 0.5, // ±1 h del tránsito superior o inferior
  riseSetMin: 30, riseSet: 0.3, // ±30 min de la salida o puesta
  newBelow: 0.1, fullAbove: 0.9, phase: 0.2, // luna nueva o llena
  max: 1.0,
}

export const SCORE_MAX = 10 // puntaje = round(SCORE_MAX · base), tope SCORE_MAX
export const LIGHT = { edgeMin: 60, edgeBonus: 1 } // primera y última hora de luz: +1

export const SLOT_MIN = 30
export const WAVE_NOGO_M = 1.2
export const NOGO_WIND_KMH = 25
export const UNCERTAIN_KMH = 10
export const NIGHT_CAP = 2
export const WINDOW_MIN = 7
export const MAX_WINDOWS = 3
