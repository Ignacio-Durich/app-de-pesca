import { describe, it, expect } from 'vitest'
import { rankSpots, rankForTrip } from '../src/score/spots.js'
import { ATUCHA } from '../src/score/config.js'
import { parseLocal, formatLocal } from '../src/lib/time.js'

const DAY = '2026-11-07'
const EXT = [
  { t: '2026-11-07T06:46', type: 'low' },
  { t: '2026-11-07T13:18', type: 'high' },
  { t: '2026-11-07T18:50', type: 'low' },
]
// 48 slots; el mejor (score 8) a las 14:00, creciente/bajante según extremos
const slotsOf = (best = 8, bestAt = '14:00') =>
  Array.from({ length: 48 }, (_, i) => {
    const t = formatLocal(parseLocal(`${DAY}T00:00`) + 30 * i)
    const h = +t.slice(11, 13)
    return { t, score: t.endsWith(bestAt) ? best : 3, night: h < 6 || h >= 20, noGo: false, windKmh: 10, meanKmh: 10, dirDeg: 90, phase: null }
  })
const hours = (sea) => Array.from({ length: 24 }, (_, h) => ({ t: `${DAY}T${String(h).padStart(2, '0')}:00`, sea }))
const sea = { hours: hours(1), lat: -40.5, lon: -62.2 }
const river = (seaM, level = { source: 'ina:29437', points: [] }) => ({ hours: hours(seaM), level })
const spot = (o = {}) => ({ id: 's', name: 'S', lat: -40.5, lon: -62.2, ...o })
const base = { spots: [spot()], catches: [], slots: slotsOf(), extremes: EXT, forecast: sea, mode: 'costa', water: 'mar', nightFishing: false, day: DAY }
const rank = (o = {}) => rankSpots({ ...base, ...o })
const first = (o) => rank(o)[0]
const texts = (r) => r.lines.map((l) => l.text)
// ~metros al norte de lat -40.5
const north = (m) => -40.5 + m / 111195
const cap = (m, o = {}) => ({ species: 'corvina', caught_at: '2026-10-01T10:00:00-03:00', lat: north(m), lon: -62.2, tide_phase: 'creciente', tide_height_m: 1, level_source: 'marea', ...o })

describe('rankSpots', () => {
  it('filters by mode', () => {
    const spots = [spot({ id: 'a', access: 'costa' }), spot({ id: 'b', access: null }), spot({ id: 'c', access: 'ambos' })]
    expect(rank({ spots, mode: 'embarcado' }).map((r) => r.spot.id).sort()).toEqual(['b', 'c'])
    expect(rank({ spots, mode: 'costa' })).toHaveLength(3)
  })

  it('best_tide bajamar without low tide', () => {
    const ext = [{ t: '2026-11-07T08:00', type: 'high' }, { t: '2026-11-07T20:00', type: 'high' }]
    const r = first({ spots: [spot({ best_tide: 'bajamar' })], extremes: ext })
    expect(r.score).toBe(0)
    expect(r.best).toBe(null)
    expect(texts(r)).toContain('hoy no le da el agua')
  })

  it('best_tide masks other phases', () => {
    const r = first({ spots: [spot({ best_tide: 'bajamar' })] })
    expect(r.best.t.slice(11)).toMatch(/^(06:30|07:00|18:30|19:00)$/)
    expect(r.score).toBe(3)
  })

  it('best_tide without extremes', () => {
    const r = first({ spots: [spot({ best_tide: 'bajamar' })], extremes: [] })
    expect(r.score).toBe(8)
    expect(r.best.t).toBe(`${DAY}T14:00`)
    expect(texts(r)).toContain('sin altura para aplicar la regla')
  })

  it('level out of range', () => {
    const s = spot({ best_level_min_m: 1.8, best_level_max_m: 2.3 })
    const r = first({ spots: [s], water: 'rio', forecast: river(2.5) })
    expect(r.score).toBe(5)
    expect(texts(r).some((t) => t.includes('2,5') && t.includes('1,8') && t.includes('2,3'))).toBe(true)
    expect(first({ spots: [s], water: 'rio', forecast: river(2) }).score).toBe(8)
  })

  it('level without forecast', () => {
    const s = spot({ best_level_min_m: 1.8, best_level_max_m: 2.3 })
    for (const forecast of [{ hours: hours(2.5) }, river(null)]) {
      const r = first({ spots: [s], water: 'rio', forecast })
      expect(r.score).toBe(8)
      expect(texts(r)).toContain('sin pronóstico de altura')
    }
  })

  it('history 0/2/3 and 301 m', () => {
    const c = (n, m = 100) => Array.from({ length: n }, () => cap(m, { tide_phase: 'bajante' }))
    // 14:00 es bajante (pleamar 13:18, +42 min)
    expect(first({ catches: c(0) }).score).toBe(8)
    expect(first({ catches: c(2) }).score).toBe(9)
    expect(first({ catches: c(3) }).score).toBe(10)
    expect(first({ catches: c(3, 301) }).score).toBe(8)
    expect(first({ catches: c(1, 299.9) }).score).toBe(9)
  })

  it('history in river lists heights and date', () => {
    const cs = [cap(10, { level_source: 'ina:29437', tide_height_m: 2.1 }), cap(10, { level_source: 'ina:29437', tide_height_m: 2.3 })]
    const r = first({ catches: cs, water: 'rio', forecast: river(2.2) })
    expect(r.score).toBe(9)
    expect(texts(r).some((t) => t.startsWith('El grupo sacó 2 corvina') && t.includes('entre 2,1 y 2,3 m') && t.includes('1/10/2026'))).toBe(true)
    expect(r.lines.find((l) => l.text.startsWith('El grupo')).origin).toBe('grupo')
  })

  it('ignores catches from another level_source', () => {
    const c = cap(50, { level_source: 'marea', tide_height_m: 2.2 })
    expect(first({ catches: [c], water: 'rio', forecast: river(2.2) }).score).toBe(8)
    expect(first({ catches: [{ ...c, level_source: 'ina:29437' }], water: 'rio', forecast: river(2.2) }).score).toBe(9)
    expect(first({ catches: [{ ...c, level_source: 'ina:29437', tide_height_m: 2.5 }], water: 'rio', forecast: river(2.2) }).score).toBe(8)
  })

  it('skips catches without position', () => {
    expect(first({ catches: [cap(0, { lat: null, lon: null, tide_phase: 'bajante' })] }).score).toBe(8)
  })

  it('history in sea uses tide_phase', () => {
    expect(first({ catches: [cap(10, { tide_phase: 'creciente' })] }).score).toBe(8)
    expect(first({ catches: [cap(10, { tide_phase: 'bajante' })] }).score).toBe(9)
  })

  it('clamps 0..10', () => {
    const cs = Array.from({ length: 3 }, () => cap(10, { tide_phase: 'bajante' }))
    expect(first({ slots: slotsOf(9), catches: cs }).score).toBe(10)
    const s = spot({ best_level_min_m: 1, best_level_max_m: 1.5 })
    expect(first({ spots: [s], slots: slotsOf(2), water: 'rio', forecast: river(3) }).score).toBe(0)
  })

  it('ties by distance', () => {
    // km sale del lugar del pronóstico (forecast.lat/lon) si no se pasa `from`
    const spots = [spot({ id: 'far', lat: north(5000) }), spot({ id: 'near' })]
    const r = rank({ spots })
    expect(r.map((x) => x.spot.id)).toEqual(['near', 'far'])
    expect(r[1].km).toBeCloseTo(5, 0)
  })

  it('old spot without new fields', () => {
    const r = first({ spots: [{ id: 'o', name: 'O', lat: -40.5, lon: -62.2, species: ['x'], best_tide: null, depth_m: null, notes: '', created_by: 'u' }] })
    expect(r.score).toBe(8)
    expect(texts(r)).toContain('sin capturas del grupo todavía')
  })

  it('source line', () => {
    const r = first({ spots: [spot({ source: 'Llompart 2011, pág. 73' })] })
    expect(r.lines).toContainEqual({ text: 'Fuente: Llompart 2011, pág. 73', origin: 'fuente' })
  })

  it('near Atucha', () => {
    const near = spot({ lat: ATUCHA.lat + 1.5 / 111.195, lon: ATUCHA.lon })
    const far = spot({ lat: ATUCHA.lat + 3 / 111.195, lon: ATUCHA.lon })
    const w = { text: 'zona de la central: verificar si se puede pescar', origin: 'aviso' }
    expect(first({ spots: [near] }).lines).toContainEqual(w)
    expect(first({ spots: [near] }).score).toBe(8)
    expect(first({ spots: [far] }).lines).not.toContainEqual(w)
  })

  it('window line', () => {
    const r = first()
    expect(r.lines[0].origin).toBe('diseño')
    expect(r.lines[0].text).toMatch(/^Ventana \d\d:\d\d–\d\d:\d\d · 8\/10/)
    expect(r.best.window.start).toBe(`${DAY}T14:00`)
  })
})

describe('rankForTrip', () => {
  it('limits to the zone and measures km from the trip', () => {
    const trip = { lat: -40.5, lon: -62.2, night_fishing: false }
    const spots = [spot({ id: 'in', lat: north(1000) }), spot({ id: 'out', lat: -30, lon: -62.2 })]
    const f = { ...sea, hours: Array.from({ length: 24 }, (_, h) => ({ t: `${DAY}T${String(h).padStart(2, '0')}:00`, sea: 1 + Math.sin(h / 2), wind: { a: 10 }, gust: { a: 12 }, dir: { a: 90 }, rain: { a: 0 }, wave: 0.3 })), days: {}, utcOffsetSeconds: -10800 }
    const r = rankForTrip(trip, f, spots, [], 'costa', DAY)
    expect(r.map((x) => x.spot.id)).toEqual(['in'])
    expect(r[0].km).toBeCloseTo(1, 0)
  })
})
