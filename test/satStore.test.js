import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { satStore } from '../src/map/satStore.js'

describe('satStore', () => {
  it('keeps the bytes of a tile under its URL and finds nothing for the others', async () => {
    const url = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/13/1/2.jpg'
    expect(await satStore.match(url)).toBeUndefined()
    await satStore.put(url, new Response(new Uint8Array([1, 2, 3])))
    expect([...new Uint8Array(await satStore.match(url))]).toEqual([1, 2, 3])
  })
})
