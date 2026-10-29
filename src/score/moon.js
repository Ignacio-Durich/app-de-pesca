import { getMoonTimes, getMoonIllumination } from 'suncalc'
import { formatLocal, localToUtcDate } from '../lib/time.js'

// Luna del día local (00:00–24:00 del lugar, por utc_offset_seconds, nunca la zona del dispositivo).
// suncalc ≥2: con utcOffset (minutos al este de UTC) devuelve exactamente ese día calendario.
// Los campos que suncalc no devuelve ese día (p. ej. sin salida de luna) se omiten.
export function moonDay(dateIso, lat, lon, utcOffsetSeconds) {
  const offMin = utcOffsetSeconds / 60
  const t = getMoonTimes(localToUtcDate(dateIso + 'T00:00', utcOffsetSeconds), lat, lon, offMin)
  const out = {}
  for (const k of ['rise', 'set', 'transit', 'lowerTransit']) {
    if (t[k]) out[k] = formatLocal(t[k].getTime() / 60000 + offMin)
  }
  const { fraction, phase } = getMoonIllumination(localToUtcDate(dateIso + 'T12:00', utcOffsetSeconds))
  return { ...out, fraction, phase }
}
