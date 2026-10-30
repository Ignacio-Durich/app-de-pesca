import { Link } from '../nav.jsx'
import { Forecast } from './Forecast.jsx'
import { Checklist } from './Checklist.jsx'
import { Itinerary } from './Itinerary.jsx'
import { Emergency } from './Emergency.jsx'

const Placeholder = (title) => () => (
  <section class="card">
    <h2>{title}</h2>
    <p class="muted">Próximamente.</p>
  </section>
)

function Mas({ tripId }) {
  const link = `${location.origin}/t/${tripId}`
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'App de Pesca', url: link })
      else await navigator.clipboard.writeText(link)
    } catch { /* cancelado */ }
  }
  return (
    <section class="stack">
      {MAS_ITEMS.map(([key, label]) => (
        <Link key={key} class="btn big" href={`/t/${tripId}/${key}`}>{label}</Link>
      ))}
      <button class="btn big" onClick={share}>Compartir link del viaje</button>
    </section>
  )
}

// Las pantallas de las otras tareas reemplazan su entrada acá. Props: { trip, me, tripId }.
export const tabScreens = {
  pronostico: Forecast,
  mapa: Placeholder('Mapa'),
  capturas: Placeholder('Capturas'),
  mas: Mas,
  checklist: Checklist,
  itinerario: Itinerary,
  especies: Placeholder('Especies'),
  emergencias: Emergency,
}

export const TABS = [
  ['pronostico', 'Pronóstico'],
  ['mapa', 'Mapa'],
  ['capturas', 'Capturas'],
  ['mas', 'Más'],
]
export const MAS_ITEMS = [
  ['checklist', 'Checklist'],
  ['itinerario', 'Itinerario'],
  ['especies', 'Especies'],
]
