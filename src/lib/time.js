// Open-Meteo devuelve hora local del lugar como texto sin offset.
// Se trata como UTC solo para aritmética: nunca depende de la zona del dispositivo.
export const parseLocal = (iso) => Date.parse(iso.length === 16 ? iso + ':00Z' : iso + 'Z') / 60000

export const formatLocal = (min) => new Date(min * 60000).toISOString().slice(0, 16)

// Instante real a partir de hora local + utc_offset_seconds de la respuesta.
export const localToUtcDate = (iso, utcOffsetSeconds) =>
  new Date(parseLocal(iso) * 60000 - utcOffsetSeconds * 1000)

// Itinerario: el viaje es en Argentina (UTC−3, sin horario de verano). Fecha y hora locales del
// viaje <-> instante real (timestamptz). Nunca depende de la zona del teléfono.
const TRIP_OFFSET_MIN = -180
export const toInstant = (date, time) => `${date}T${time}:00-03:00`
export function fromInstant(iso) {
  const local = formatLocal(Math.floor(Date.parse(iso) / 60000) + TRIP_OFFSET_MIN)
  return { date: local.slice(0, 10), time: local.slice(11) }
}
