import { describe, it, expect } from 'vitest'
import { toInstant, fromInstant } from '../src/lib/time.js'

describe('trip-local date/time <-> instant (offset -03:00)', () => {
  it('builds an ISO instant with the trip offset', () => {
    expect(toInstant('2026-11-07', '06:00')).toBe('2026-11-07T06:00:00-03:00')
  })
  it('reads it back as trip-local, whatever the server format (UTC)', () => {
    expect(fromInstant('2026-11-07T06:00:00-03:00')).toEqual({ date: '2026-11-07', time: '06:00' })
    expect(fromInstant('2026-11-07T09:00:00+00:00')).toEqual({ date: '2026-11-07', time: '06:00' })
  })
  it('crosses midnight correctly', () => {
    expect(fromInstant('2026-11-08T01:30:00+00:00')).toEqual({ date: '2026-11-07', time: '22:30' })
  })
  it('does not depend on the device timezone', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Asia/Tokyo'
    try {
      expect(fromInstant('2026-11-07T09:00:00Z')).toEqual({ date: '2026-11-07', time: '06:00' })
    } finally {
      process.env.TZ = tz
    }
  })
})
