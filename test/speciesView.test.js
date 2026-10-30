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

test('cada especie tiene foto con autor (o dominio público), licencia y página', () => {
  for (const e of species) {
    expect(e.photo.src).toBe(`/species/${e.id}.jpg`)
    expect(e.photo.license).toBeTruthy()
    expect(e.photo.page).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
    if (e.photo.license !== 'Public domain') expect(e.photo.author, e.id).toBeTruthy()
  }
})
