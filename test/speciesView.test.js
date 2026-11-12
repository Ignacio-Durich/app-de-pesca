import { existsSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import species from '../src/data/species.json'
import { keepNote, matches, vedaLine } from '../src/species/view.js'

const by = (id) => species.find((e) => e.id === id)

describe('keepNote', () => {
  test('devolución obligatoria → devolver siempre', () => {
    expect(keepNote(by('cazon'))).toEqual({ text: 'Devolver siempre', release: true })
  })
  test('con reserva → el texto del reglamento', () => {
    expect(keepNote(by('rayas'))).toEqual({ text: 'Hasta 2 por día; el resto se devuelve.', release: true })
  })
  test('sin devolución: se puede llevar', () => {
    expect(keepNote(by('pescadilla'))).toEqual({ text: 'Se puede llevar', release: false })
    expect(keepNote(by('pejerrey'))).toEqual({ text: 'Se puede llevar', release: false })
  })
  test('veda según los días del viaje: cualquier día adentro → en veda (cruza el fin de año)', () => {
    const veda = { text: 'En veda del 1/10 al 15/1: no se puede pescar', release: true }
    const libre = { text: 'Se puede llevar', release: false }
    const d = by('dorado-ba')
    expect(keepNote(d, { start: '2026-10-03', end: '2026-10-05' })).toEqual(veda)
    expect(keepNote(d, { start: '2027-01-20', end: '2027-01-25' })).toEqual(libre)
    expect(keepNote(d, { start: '2027-01-10', end: '2027-01-20' })).toEqual(veda) // solapa en parte
    expect(keepNote(d, { start: '2026-09-25', end: '2026-10-01' })).toEqual(veda)
    expect(keepNote(d, { start: '2026-09-20', end: '2026-09-30' })).toEqual(libre)
    expect(keepNote(d, { start: '2026-12-30', end: '2027-01-02' })).toEqual(veda)
  })
  test('la línea de veda se arma con las fechas del JSON', () => {
    expect(vedaLine(by('dorado-ba').veda)).toBe('Veda: 1/10 al 15/1')
  })
  test('sin fechas del viaje: usa hoy', () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(keepNote(by('dorado-ba'))).toEqual(keepNote(by('dorado-ba'), { start: today, end: today }))
  })
  test('especies de mar: igual con o sin fechas', () => {
    for (const e of species.filter((x) => x.waters.includes('mar'))) {
      expect(keepNote(e, { start: '2026-10-03', end: '2026-10-05' })).toEqual(keepNote(e))
    }
  })
  test('sin cupo ni devolución verificados → no dice "se puede llevar"', () => {
    expect(keepNote(by('surubi'))).toEqual({ text: 'Sin regla verificada: mirá el reglamento', release: true })
  })
  test('dorado en Entre Ríos: devolver siempre (Ley 11.174)', () => {
    expect(keepNote(by('dorado-er'))).toEqual({ text: 'Devolver siempre', release: true })
  })
})

describe('matches', () => {
  test('busca en nombre y nombre científico, sin tildes ni mayúsculas', () => {
    expect(matches(by('cazon'), 'CAZON')).toBe(true)
    expect(matches(by('corvina-rubia'), 'furnieri')).toBe(true)
    expect(matches(by('pez-elefante'), 'gallo')).toBe(true)
    expect(matches(by('gatuzo'), 'corvina')).toBe(false)
    expect(matches(by('gatuzo'), '  ')).toBe(true)
  })
})

test('cada foto existe, con autor (o dominio público), licencia y página', () => {
  for (const e of species.filter((x) => x.photo)) {
    expect(e.photo.src).toMatch(/^\/species\/[a-z-]+\.jpg$/)
    expect(existsSync(`public${e.photo.src}`), e.id).toBe(true)
    expect(e.photo.license).toBeTruthy()
    expect(e.photo.page).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
    if (e.photo.license !== 'Public domain') expect(e.photo.author, e.id).toBeTruthy()
  }
})
