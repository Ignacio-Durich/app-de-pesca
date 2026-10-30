import { describe, expect, test } from 'vitest'
import species from '../src/data/species.json'
import { license, rules } from '../src/data/regulation.json'

const official = (u) => {
  const h = new URL(u).hostname
  return h === 'gba.gob.ar' || h.endsWith('.gba.gob.ar')
}
const hasOfficial = (e) => e.sources.some((s) => official(s.url))
const by = (id) => species.find((e) => e.id === id)

describe('species.json', () => {
  test('hay especies y cada una tiene id y name únicos', () => {
    expect(species.length).toBeGreaterThan(0)
    for (const e of species) {
      expect(e.id).toBeTruthy()
      expect(e.name).toBeTruthy()
      expect(e.waters).toEqual(['mar'])
    }
    expect(new Set(species.map((e) => e.id)).size).toBe(species.length)
    expect(new Set(species.map((e) => e.name)).size).toBe(species.length)
  })

  test('verified:true implica al menos una fuente con url https', () => {
    for (const e of species.filter((x) => x.verified)) {
      expect(e.sources.length).toBeGreaterThan(0)
      for (const s of e.sources) expect(s.url).toMatch(/^https:\/\//)
    }
  })

  test('talla, cupo o devolución solo con fuente oficial (gba.gob.ar / normas.gba.gob.ar)', () => {
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
