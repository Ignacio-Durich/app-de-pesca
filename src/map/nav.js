const R = 6371.0088 // km, radio medio terrestre
const rad = (d) => (d * Math.PI) / 180

// Distancia (haversine) en km y rumbo inicial en grados [0, 360) de punto 1 a punto 2.
export function distanceBearing(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1)
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return { km, deg }
}

// "40°33,0' S  62°13,8' O": grados y minutos con 1 decimal, coma decimal, E/O.
function part(v, pos, neg) {
  const a = Math.abs(v)
  let d = Math.floor(a)
  let m = Math.round((a - d) * 60 * 10) / 10
  if (m >= 60) { d += 1; m = 0 }
  return `${d}°${String(m.toFixed(1)).padStart(4, '0').replace('.', ',')}' ${v < 0 ? neg : pos}`
}
export const toDegMin = (lat, lon) => `${part(lat, 'N', 'S')}  ${part(lon, 'E', 'O')}`

// Filas (spots, sondeos) a menos de `km` del punto; las que no tienen coordenadas quedan afuera.
export const within = (rows, lat, lon, km) =>
  rows.filter((r) => r.lat != null && r.lon != null && distanceBearing(lat, lon, r.lat, r.lon).km < km)
