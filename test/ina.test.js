import { describe, it, expect } from 'vitest'
import obs from './fixtures/ina-zarate-obs.json'
import prono from './fixtures/ina-zarate-prono.json'
import stations from '../src/data/stations.json'
import { nearestStation, inaUrls, parseLevels, fetchLevels } from '../src/river/ina.js'

// Fixtures reales del INA, bajadas el 11/11/2026.
const z = stations[0]
const ok = (j) => async () => ({ ok: true, json: async () => j })
const bad = async () => ({ ok: false, status: 500 })

describe('nearestStation', () => {
  it('Chacras del Paraná -> zarate', () => expect(nearestStation(-33.968, -59.256).id).toBe('zarate'))
  it('San Blas -> null', () => expect(nearestStation(-40.55, -62.23)).toBeNull())
})

describe('parseLevels', () => {
  const a = { rows: [{ timestart: '2026-11-11T21:00:00.000Z', valor: 0.78 }] }
  const p = (q, v) => ({ timestart: '2026-11-11T21:00:00.000Z', valor: v, qualifier: q })
  const pr = { forecast_date: 'X', series: [{ pronosticos: [p('main', 0.9), p('p01', 0.5), p('p99', 1.4)] }] }

  it('converts UTC to trip local time', () => {
    expect(parseLevels(a, null).points[0].t).toBe('2026-11-11T18:00')
  })
  it('measured beats main; the band shifts by the offset', () => {
    const r = parseLevels(a, pr)
    expect(r.offsetM).toBeCloseTo(-0.12, 6)
    expect(r.points[0]).toMatchObject({ t: '2026-11-11T18:00', h: 0.78, measured: true })
    expect(r.points[0].lo).toBeCloseTo(0.38, 6)
    expect(r.points[0].hi).toBeCloseTo(1.28, 6)
  })
  it('main/p01/p99 per hour (no overlap -> offset 0)', () => {
    expect(parseLevels(null, pr)).toEqual({
      forecastDate: 'X',
      offsetM: 0,
      points: [{ t: '2026-11-11T18:00', h: 0.9, lo: 0.5, hi: 1.4, measured: false }],
    })
  })
  it('no overlap: measured and forecast at different hours -> offset 0', () => {
    const later = { forecast_date: 'X', series: [{ pronosticos: [{ ...p('main', 0.9), timestart: '2026-11-11T22:00:00.000Z' }] }] }
    const r = parseLevels(a, later)
    expect(r.offsetM).toBe(0)
    expect(r.points.map((x) => x.h)).toEqual([0.78, 0.9])
  })
  it('real fixtures: sorted, measured and forecast', () => {
    const { points } = parseLevels(obs, prono)
    expect(points.some((x) => x.measured)).toBe(true)
    expect(points.some((x) => !x.measured)).toBe(true)
    expect(points.every((x, i) => i === 0 || points[i - 1].t < x.t)).toBe(true)
  })
  // R9: medido 0,78 m vs main 1,24 m el 11/11 18:00 -> la curva corrida no salta al empalmar.
  it('real fixtures: offset at the last shared hour, no jump at the seam', () => {
    const { points, offsetM } = parseLevels(obs, prono)
    const i = points.findLastIndex((x) => x.measured)
    expect(points[i].t).toBe('2026-11-11T18:00')
    expect(offsetM).toBeCloseTo(0.78 - 1.24, 6)
    expect(points[i + 1].measured).toBe(false)
    expect(Math.abs(points[i + 1].h - points[i].h)).toBeLessThan(0.1)
  })
})

describe('inaUrls', () => {
  it('7 días de medidas y corrida last', () => {
    const u = inaUrls(z, new Date('2026-11-11T12:00:00Z'))
    expect(u.obs).toContain('/series/29437/observaciones?timestart=2026-11-04T12:00:00.000Z&timeend=2026-11-11T12:00:00.000Z')
    expect(u.prono).toContain('/calibrados/440/corridas/last?estacion_id=5907&includeProno=true&format=json')
  })
})

describe('fetchLevels', () => {
  const f = (o, p) => async (url) => (url.includes('/obs/') ? o : p)(url)
  it('si falla el pronóstico devuelve solo las medidas', async () => {
    const r = await fetchLevels(z, { fetchImpl: f(ok(obs), bad) })
    expect(r.source).toBe('ina:29437')
    expect(r.stationId).toBe('zarate')
    expect(r.points.length).toBeGreaterThan(0)
    expect(r.points.every((x) => x.measured)).toBe(true)
    expect(r.offsetM).toBe(0)
  })
  it('expone offsetM', async () => {
    const r = await fetchLevels(z, { fetchImpl: f(ok(obs), ok(prono)) })
    expect(r.offsetM).toBeCloseTo(-0.46, 6)
  })
  it('si fallan los dos rechaza', async () => {
    await expect(fetchLevels(z, { fetchImpl: f(bad, bad) })).rejects.toThrow()
  })
})
