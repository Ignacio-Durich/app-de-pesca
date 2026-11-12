import { existsSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import species from '../src/data/species.json'
import { keepNote, matches } from '../src/species/view.js'

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
  test('en veda → no se puede pescar (la veda cruza el fin de año)', () => {
    const veda = { text: 'En veda del 1/10 al 15/1: no se puede pescar', release: true }
    expect(keepNote(by('dorado-ba'), new Date(2026, 10, 11))).toEqual(veda)
    expect(keepNote(by('dorado-ba'), new Date(2027, 0, 15))).toEqual(veda)
    expect(keepNote(by('dorado-ba'), new Date(2026, 9, 1))).toEqual(veda)
    expect(keepNote(by('dorado-ba'), new Date(2027, 0, 16))).toEqual({ text: 'Se puede llevar', release: false })
    expect(keepNote(by('dorado-ba'), new Date(2026, 8, 30))).toEqual({ text: 'Se puede llevar', release: false })
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
