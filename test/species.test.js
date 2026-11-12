import { describe, expect, test } from 'vitest'
import species from '../src/data/species.json'
import { license, rules } from '../src/data/regulation.json'

import rio from '../src/data/regulation-rio.json'

// Dominios oficiales por provincia (spec §2.7).
const OFFICIAL = { ba: ['gba.gob.ar', 'gba.gov.ar'], er: ['entrerios.gov.ar', 'senadoer.gob.ar'] }
const official = (u, zone = 'ba') => {
  const h = new URL(u).hostname
  return OFFICIAL[zone].some((d) => h === d || h.endsWith(`.${d}`))
}
const hasOfficial = (e) => (e.zones ?? ['ba']).every((z) => e.sources.some((s) => official(s.url, z)))
const by = (id) => species.find((e) => e.id === id)

describe('species.json', () => {
  test('hay especies y cada una tiene id y name únicos', () => {
    expect(species.length).toBeGreaterThan(0)
    for (const e of species) {
      expect(e.id).toBeTruthy()
      expect(e.name).toBeTruthy()
      expect([['mar'], ['rio']]).toContainEqual(e.waters)
      if (e.waters[0] === 'rio') for (const z of e.zones) expect(['ba', 'er']).toContain(z)
    }
    expect(new Set(species.map((e) => e.id)).size).toBe(species.length)
    // El mismo nombre puede repetirse solo en zonas distintas (dorado de Buenos Aires y de Entre Ríos).
    const keys = species.flatMap((e) => (e.zones ?? ['mar']).map((z) => `${e.name}|${z}`))
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('verified:true implica al menos una fuente con url https', () => {
    for (const e of species.filter((x) => x.verified)) {
      expect(e.sources.length).toBeGreaterThan(0)
      for (const s of e.sources) expect(s.url).toMatch(/^https:\/\//)
    }
  })

  test('talla, cupo o devolución solo con fuente oficial de cada provincia', () => {
    for (const e of species) {
      if (e.minSizeCm != null || e.release != null || e.dailyLimit != null) {
        expect(hasOfficial(e), e.id).toBe(true)
      }
    }
  })

  test('ningún campo de texto queda vacío (null o texto real)', () => {
    for (const e of species) {
      for (const k of ['season', 'bait', 'dailyLimit', 'release']) {
        expect(e[k] === null || (typeof e[k] === 'string' && e[k].trim() !== ''), `${e.id}.${k}`).toBe(true)
      }
    }
  })

  test('valores del reglamento', () => {
    expect(by('corvina-rubia').minSizeCm).toBe(35)
    expect(by('pescadilla').minSizeCm).toBe(30)
    expect(by('gatuzo').minSizeCm).toBe(60)
    expect(by('cazon').release).toMatch(/devoluci/i)
    expect(by('pez-elefante').dailyLimit).toMatch(/2/)
    expect(by('lenguado').minSizeCm).toBeNull()
    expect(by('pejerrey').notes).toContain('no podrá utilizarse ninguna clase de carnada')
  })

  test('río: dorado según la orilla; lo demás sin verificar queda null', () => {
    expect(by('dorado-ba')).toMatchObject({ zones: ['ba'], minSizeCm: 60, dailyLimit: '2 por día', veda: { from: '10-01', to: '01-15' } })
    expect(by('dorado-er')).toMatchObject({ zones: ['er'], minSizeCm: null })
    expect(by('dorado-er').release).toMatch(/^Devolución obligatoria/)
    for (const id of ['surubi', 'boga', 'pati', 'armado', 'bagre-amarillo', 'bagre-blanco', 'sabalo']) {
      expect(by(id), id).toMatchObject({ waters: ['rio'], zones: ['ba', 'er'], minSizeCm: null, dailyLimit: null, release: null })
    }
  })
})

describe('regulation-rio.json', () => {
  test('cada regla de cada orilla tiene fuente oficial de su provincia', () => {
    expect(Object.keys(rio).sort()).toEqual(['ba', 'er'])
    for (const [zone, z] of Object.entries(rio)) {
      expect(z.note).toBeTruthy()
      for (const r of z.rules) expect(r.sources.some((s) => official(s.url, zone)), r.text).toBe(true)
    }
    expect(rio.er.license.url).toBeNull() // no hay página oficial verificada
    expect(rio.er.license.sources.some((s) => official(s.url, 'er'))).toBe(true)
  })

  test('la veda de pejerrey se cita con su exclusión del Delta, sin resolverla', () => {
    const txt = rio.ba.rules.map((r) => r.text).join(' ')
    expect(txt).toContain('la región del Delta del Paraná')
    expect(txt).toContain('no está verificado')
  })
})

describe('license', () => {
  test('link al trámite, costo no publicado y fuente oficial', () => {
    expect(license.url).toBe('https://maa.gba.gov.ar/sistemas/pesca/licencias/licencias00.php')
    expect(license.notes.join(' ')).toMatch(/costo no publicado/i)
    expect(license.sources.some((s) => official(s.url))).toBe(true)
    expect(license.types).toHaveLength(9)
    expect(license.types.map((t) => t.name)).toContain('Costera Menor Marítima')
    expect(license.notes.join(' ')).toContain('Cabo San Antonio')
  })

  test('cantidad de cañas: se muestran ambas citas, sin resolverlas', () => {
    const txt = rules.map((r) => r.text).join(' ')
    expect(txt).toContain('Dos cañas por persona')
    expect(txt).toContain('Con una (1) caña en todos los ambientes')
    expect(txt).toContain('depende del tipo de licencia')
  })
})
