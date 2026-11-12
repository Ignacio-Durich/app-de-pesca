// Resumen de una especie para la tarjeta. Sale de los campos del reglamento (species.json):
// "Devolución obligatoria" → devolver siempre; otra devolución (con reserva) → ese texto;
// sin devolución, el cupo diario permite llevar (la talla mínima va en su propio renglón de la tarjeta).
// Una veda ({ from, to } en 'MM-DD', inclusive; puede cruzar el fin de año) manda sobre todo lo demás:
// si algún día del viaje (start..end, 'YYYY-MM-DD') cae en la veda, el viaje está en veda.
const inVeda = ({ from, to }, day) => (from <= to ? day >= from && day <= to : day >= from || day <= to)
const pad = (n) => String(n).padStart(2, '0')
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function tripInVeda(veda, start, end) {
  const d = new Date(`${start}T00:00Z`), last = new Date(`${end}T00:00Z`)
  for (let i = 0; d <= last && i < 366; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    if (inVeda(veda, `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`)) return true
  }
  return false
}

// Sin fechas del viaje, se usa el día de hoy.
export function keepNote(s, { start, end } = {}) {
  const from = start ?? end ?? localToday(), to = end ?? from
  if (s.veda && tripInVeda(s.veda, from, to)) return { text: s.veda.text, release: true }
  if (s.release?.startsWith('Devolución obligatoria')) return { text: 'Devolver siempre', release: true }
  if (s.release) return { text: s.release, release: true }
  // Sin cupo ni devolución con fuente no se afirma nada (spec §2.7).
  if (s.dailyLimit == null) return { text: 'Sin regla verificada: mirá el reglamento', release: true }
  return { text: 'Se puede llevar', release: false }
}

// "Veda: 1/10 al 15/1", siempre visible en la tarjeta cuando hay veda.
export const vedaLine = ({ from, to }) => {
  const dm = (x) => x.split('-').map(Number).reverse().join('/')
  return `Veda: ${dm(from)} al ${dm(to)}`
}

const fold = (t) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export const matches = (s, q) => {
  const f = fold(q).trim()
  return !f || fold(`${s.name} ${s.scientific}`).includes(f)
}
