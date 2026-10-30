// Resumen de una especie para la tarjeta. Sale de los campos del reglamento (species.json):
// "Devolución obligatoria" → devolver siempre; otra devolución (con reserva) → ese texto;
// sin devolución, el cupo diario permite llevar (la talla mínima va en su propio renglón de la tarjeta).
export function keepNote(s) {
  if (s.release?.startsWith('Devolución obligatoria')) return { text: 'Devolver siempre', release: true }
  if (s.release) return { text: s.release, release: true }
  return { text: 'Se puede llevar', release: false }
}

const fold = (t) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export const matches = (s, q) => {
  const f = fold(q).trim()
  return !f || fold(`${s.name} ${s.scientific}`).includes(f)
}
