import { describe, it, expect } from 'vitest'
import { makeClient } from '../src/lib/db.js'

const A = '11111111-1111-4111-8111-111111111111'

// Fake fetch: records the headers of the request and answers an empty list.
function spy() {
  const seen = []
  const fetch = async (url, init) => {
    seen.push(new Headers(init?.headers))
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { seen, fetch }
}
const cfg = (fetch) => ({ url: 'http://localhost:54321', key: 'anon-test-key', fetch })

describe('makeClient', () => {
  it('sends x-trip-id when there is a trip id', async () => {
    const { seen, fetch } = spy()
    await makeClient(A, cfg(fetch)).from('checklist_items').select()
    expect(seen).toHaveLength(1)
    expect(seen[0].get('x-trip-id')).toBe(A)
  })

  it('sends no x-trip-id without a trip id', async () => {
    const { seen, fetch } = spy()
    await makeClient(null, cfg(fetch)).from('checklist_items').select()
    expect(seen).toHaveLength(1)
    expect(seen[0].has('x-trip-id')).toBe(false)
  })
})
