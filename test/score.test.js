import { describe, it, expect } from 'vitest'
import marine from './fixtures/marine-sanblas.json'
import weather from './fixtures/weather-sanblas.json'
import { normalize, MODELS } from '../src/forecast/fetch.js'
import { findExtremes } from '../src/forecast/tides.js'
import { parseLocal } from '../src/lib/time.js'
import { WEIGHTS } from '../src/score/config.js'
import { median, tideFactor, windFactor, moonFactor, scoreDay, baseScore } from '../src/score/score.js'

const DAY = '2026-11-07'
const fresh = () => normalize(marine, weather, '2026-10-29T12:00:00Z')
const run = (f, mode = 'costa', nightFishing = false) =>
  scoreDay(f, findExtremes(f.hours), DAY, mode, { nightFishing })
const slot = (slots, hhmm) => slots.find((s) => s.t === `${DAY}T${hhmm}`)
const base = ({ factors }) => {
  let num = 0, den = 0
  for (const k of Object.keys(WEIGHTS)) if (factors[k] != null) (num += WEIGHTS[k] * factors[k]), (den += WEIGHTS[k])
  return num / den
}
const setModel = (f, field, model, fn) => f.hours.forEach((h) => (h[field][model] = fn(h)))

// fase sintética: solo importan rising, minutos y tipo de cada extremo
const ph = (rising, sincePrevMin, toNextMin) => ({
  rising,
  sincePrevMin,
  toNextMin,
  prev: { type: rising ? 'low' : 'high' },
  next: { type: rising ? 'high' : 'low' },
})

describe('median', () => {
  it('ignores nulls', () => {
    expect(median([10, null, 30])).toBe(20)
    expect(median([null, null])).toBe(null)
    expect(median([7])).toBe(7)
    expect(median([3, 1, 2])).toBe(2)
  })
})

describe('tideFactor', () => {
  it('costa (spec §4)', () => {
    expect(tideFactor(ph(true, 300, 90), 'costa')).toBe(1.0) // 90 min antes de la pleamar
    expect(tideFactor(ph(false, 30, 330), 'costa')).toBe(1.0) // 30 min después de la pleamar
    expect(tideFactor(ph(false, 90, 270), 'costa')).toBe(0.5) // 90 min después
    expect(tideFactor(ph(false, 180, 180), 'costa')).toBe(0.25) // mitad de la bajante
    expect(tideFactor(ph(false, 330, 30), 'costa')).toBe(0.2) // 30 min antes de la bajamar
    expect(tideFactor(ph(true, 30, 330), 'costa')).toBe(0.2) // 30 min después de la bajamar
    expect(tideFactor(ph(true, 180, 180), 'costa')).toBe(0.7) // resto de la creciente
  })
  it('embarcado (spec §4)', () => {
    expect(tideFactor(ph(true, 330, 30), 'embarcado')).toBe(1.0)
    expect(tideFactor(ph(false, 30, 330), 'embarcado')).toBe(1.0)
    expect(tideFactor(ph(true, 270, 90), 'embarcado')).toBe(0.6)
    expect(tideFactor(ph(false, 180, 180), 'embarcado')).toBe(0.2)
  })
  it('no phase → null', () => {
    expect(tideFactor(null, 'costa')).toBe(null)
  })
})

describe('windFactor', () => {
  it('uses max(wind, 0.7·gust)', () => {
    expect(windFactor(14, 18, null, 'costa')).toBe(1.0)
    expect(windFactor(10, 40, null, 'costa')).toBe(0.2)
  })
  it('bands', () => {
    expect(windFactor(25, null, null, 'costa')).toBe(0.6)
    expect(windFactor(36, null, null, 'costa')).toBe(0)
    expect(windFactor(12, null, null, 'embarcado')).toBe(1.0)
    expect(windFactor(20, null, null, 'embarcado')).toBe(0.6)
    expect(windFactor(25, null, null, 'embarcado')).toBe(0.3)
    expect(windFactor(26, null, null, 'embarcado')).toBe(0)
  })
  it('waves over 1.2 m zero the wind only in embarcado', () => {
    expect(windFactor(11, 0, 1.3, 'embarcado')).toBe(0)
    expect(windFactor(11, 0, 1.3, 'costa')).toBe(1.0)
  })
  it('no wind → null', () => {
    expect(windFactor(null, null, null, 'costa')).toBe(null)
  })
})

describe('moonFactor', () => {
  const t = (hhmm) => parseLocal(`${DAY}T${hhmm}`)
  const moon = { rise: `${DAY}T04:36`, set: `${DAY}T18:38`, transit: `${DAY}T11:31`, fraction: 0.5 }
  it('base 0.3 and bonuses', () => {
    expect(moonFactor(t('08:00'), moon)).toBeCloseTo(0.3)
    expect(moonFactor(t('12:20'), moon)).toBeCloseTo(0.8) // ±1 h del tránsito
    expect(moonFactor(t('04:10'), moon)).toBeCloseTo(0.6) // ±30 min de la salida
    expect(moonFactor(t('08:00'), { ...moon, fraction: 0.03 })).toBeCloseTo(0.5)
    expect(moonFactor(t('08:00'), { ...moon, fraction: 0.95 })).toBeCloseTo(0.5)
  })
  it('caps at 1 and missing fields add nothing', () => {
    const all = { rise: `${DAY}T12:00`, transit: `${DAY}T12:00`, fraction: 0.01 }
    expect(moonFactor(t('12:00'), all)).toBe(1)
    expect(moonFactor(t('12:00'), { fraction: 0.5 })).toBeCloseTo(0.3)
  })
})

describe('baseScore', () => {
  it('an exact .5 rounds up despite float error (F7: 7.4999999 → 8)', () => {
    // 0.5·0.7 + 0.3·1 + 0.1·0.3 + 0.1·0.7 = 0.75 → 7.5
    expect(baseScore({ tide: 0.7, wind: 1.0, moon: 0.3, weather: 1 - 30 / 100 })).toBe(8)
  })
  it('no tide and no wind → null: the moon alone is not a forecast (F16)', () => {
    expect(baseScore({ tide: null, wind: null, moon: 1, weather: null })).toBe(null)
    expect(baseScore({ tide: null, wind: null, moon: 1, weather: 0.9 })).toBe(null)
    expect(baseScore({ tide: 1, wind: null, moon: 1, weather: null })).toBe(10)
  })
})

describe('scoreDay: a day with no hourly rows (F16)', () => {
  it('gives no score, so no moon-only window', () => {
    const f = fresh()
    f.hours = f.hours.filter((h) => !h.t.startsWith(DAY))
    expect(scoreDay(f, [], DAY, 'costa', { nightFishing: true }).every((s) => s.score === null)).toBe(true)
  })
})

describe('scoreDay (fixtures 7/11)', () => {
  const slots = run(fresh())

  it('48 slots every 30 min of the local day', () => {
    expect(slots).toHaveLength(48)
    expect(slots[0].t).toBe(`${DAY}T00:00`)
    expect(slots[1].t).toBe(`${DAY}T00:30`)
    expect(slots.at(-1).t).toBe(`${DAY}T23:30`)
  })

  it(':30 interpolates each model between neighbouring hours', () => {
    // ecmwf: max(11.75, 0.7·28.95) = 20.265; gfs: max(10.7, 0.7·14.6) = 10.7 → mediana 15.48
    expect(slot(slots, '12:30').windKmh).toBeCloseTo(15.5, 1)
  })

  it('00:30 sees the tide phase from the previous day extreme (Review Focus 1)', () => {
    expect(slot(slots, '00:30').factors.tide).not.toBe(null)
  })

  it('night without night fishing is capped at 2; with night fishing it is not', () => {
    for (const s of slots.filter((s) => s.night)) expect(s.score).toBeLessThanOrEqual(2)
    expect(slot(slots, '03:00').night).toBe(true)
    expect(slot(slots, '12:00').night).toBe(false)
    const nf = slot(run(fresh(), 'costa', true), '00:30')
    expect(nf.night).toBe(true)
    expect(nf.score).toBe(Math.round(10 * base(nf)))
    expect(nf.score).toBeGreaterThan(2)
  })

  it('first and last hour of light add +1 (cap 10)', () => {
    for (const hhmm of ['06:00', '19:30']) {
      const s = slot(slots, hhmm)
      expect(s.score).toBe(Math.min(10, Math.round(10 * base(s)) + 1))
    }
    const mid = slot(slots, '12:00')
    expect(mid.score).toBe(Math.round(10 * base(mid)))
  })

  it('all wind null → factors.wind null and weights renormalize (Review Focus 2)', () => {
    const f = fresh()
    for (const m of Object.keys(MODELS)) setModel(f, 'wind', m, () => null), setModel(f, 'gust', m, () => null)
    const s = slot(run(f), '10:00')
    expect(s.factors.wind).toBe(null)
    expect(s.windKmh).toBe(null)
    expect(s.uncertain).toBe(false)
    const { tide, moon, weather: w } = s.factors
    expect(s.score).toBe(Math.round((10 * (0.5 * tide + 0.1 * moon + 0.1 * w)) / 0.7))
  })

  it('models more than 10 km/h apart → uncertain', () => {
    expect(slot(slots, '12:00').uncertain).toBe(false)
    const f = fresh()
    f.hours.find((h) => h.t === `${DAY}T12:00`).wind.gfs = 40
    expect(slot(run(f), '12:00').uncertain).toBe(true)
  })

  it('meanKmh is the median of the models mean wind, without gusts (F9)', () => {
    // 12:30: ecmwf 11.75, gfs 10.7 (icon null in the fixture) → 11.2; windKmh (with gusts) 15.5
    const s = slot(slots, '12:30')
    expect(s.meanKmh).toBeCloseTo(11.2, 1)
    expect(s.windKmh).toBeGreaterThan(s.meanKmh)
  })

  it('a single model available: median of one value, never uncertain', () => {
    const f = fresh()
    setModel(f, 'wind', 'gfs', () => null)
    setModel(f, 'gust', 'gfs', () => null)
    const s = slot(run(f), '12:00')
    expect(s.windKmh).toBeCloseTo(19.4, 1) // max(11.2, 0.7·27.7)
    expect(s.uncertain).toBe(false)
  })

  it('embarcado: daytime wind over 25 km/h → noGo; never at night or in costa', () => {
    // 18:00: ecmwf max(18, 0.7·34.9) = 24.4; gfs 26.6 → mediana 25.5
    expect(slot(run(fresh(), 'embarcado'), '18:00').noGo).toBe(true)
    expect(slot(run(fresh(), 'embarcado'), '21:00').noGo).toBe(false) // noche
    expect(slot(slots, '18:00').noGo).toBe(false)
    expect(slot(run(fresh(), 'embarcado'), '12:00').noGo).toBe(false)
  })

  it('embarcado: waves over 1.2 m → noGo and wind factor 0', () => {
    const f = fresh()
    f.hours.forEach((h) => (h.wave = 1.5))
    const s = slot(run(f, 'embarcado'), '12:00')
    expect(s.noGo).toBe(true)
    expect(s.factors.wind).toBe(0)
  })

  it('dirDeg is the circular mean of the models', () => {
    // 12:00: ecmwf 360, gfs 47 → ~23.5°, no 203.5°
    expect(slot(slots, '12:00').dirDeg).toBeCloseTo(23.5, 0)
  })
})
