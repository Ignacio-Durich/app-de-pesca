import { expect, test } from 'vitest'
import contacts from '../src/data/emergency.json'

test('las generales van primero (el botón grande llama al 106) y las de río tienen fuente oficial', () => {
  expect(contacts.find((c) => c.kind === 'tel').value).toBe('106')
  expect(contacts.find((c) => c.kind === 'radio').label).toBe('VHF canal 16')
  const rio = contacts.filter((c) => c.water)
  expect(rio.length).toBeGreaterThan(0)
  for (const c of rio) {
    expect(c.water).toBe('rio')
    expect(new URL(c.source).hostname).toBe('www.argentina.gob.ar')
  }
})
