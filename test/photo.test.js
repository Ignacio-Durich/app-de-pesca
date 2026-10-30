import { describe, it, expect } from 'vitest'
import { queuedPhotos } from '../src/catches/photo.js'

describe('queuedPhotos (F11)', () => {
  it('maps the path of each queued photo to its local Blob; ops without photo are ignored', () => {
    const blob = new Blob(['jpg'])
    const ops = [
      { id: '1', table: 'catches', kind: 'upsert', row: { id: 'a' }, photo: { path: 't/a.jpg', blob } },
      { id: '2', table: 'catches', kind: 'upsert', row: { id: 'b' } },
      { id: '3', table: 'catches', kind: 'delete', rowId: 'c' },
    ]
    const m = queuedPhotos(ops)
    expect([...m.keys()]).toEqual(['t/a.jpg'])
    expect(m.get('t/a.jpg')).toBe(blob)
    expect(queuedPhotos([]).size).toBe(0)
  })
})
