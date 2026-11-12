// Resumen de una especie para la tarjeta. Sale de los campos del reglamento (species.json):
// "Devolución obligatoria" → devolver siempre; otra devolución (con reserva) → ese texto;
// sin devolución, el cupo diario permite llevar (la talla mínima va en su propio renglón de la tarjeta).
// Una veda ({ from, to } en 'MM-DD', inclusive; puede cruzar el fin de año) manda sobre todo lo demás.
const mmdd = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inVeda = ({ from, to }, day) => (from <= to ? day >= from && day <= to : day >= from || day <= to)

export function keepNote(s, today = new Date()) {
  if (s.veda && inVeda(s.veda, mmdd(today))) return { text: s.veda.text, release: true }
  if (s.release?.startsWith('Devolución obligatoria')) return { text: 'Devolver siempre', release: true }
  if (s.release) return { text: s.release, release: true }
  // Sin cupo ni devolución con fuente no se afirma nada (spec §2.7).
  if (s.dailyLimit == null) return { text: 'Sin regla verificada: mirá el reglamento', release: true }
  return { text: 'Se puede llevar', release: false }
}

const fold = (t) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export const matches = (s, q) => {
  const f = fold(q).trim()
  return !f || fold(`${s.name} ${s.scientific}`).includes(f)
}
