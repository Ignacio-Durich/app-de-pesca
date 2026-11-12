import { useEffect, useState } from 'preact/hooks'
import { Link } from '../nav.jsx'
import { listRows } from '../lib/repo.js'
import { loadTrip, getMe, setMe } from '../trips/trips.js'
import { pending, onQueueChange } from '../lib/queue.js'
import { WhoAreYou } from './WhoAreYou.jsx'
import { tabScreens, TABS, MAS_ITEMS } from './tabs.jsx'
import { PrepareBar, PrepareBanner, InstallGuide } from './Prepare.jsx'

const TABLE_LABEL = {
  checklist_items: 'Checklist', itinerary_items: 'Itinerario', trips: 'Viaje', catches: 'Captura', spots: 'Punto', soundings: 'Sondeo',
}
const describe = (op) => {
  const what = op.row?.text ?? op.row?.title ?? op.row?.name ?? ''
  return `${TABLE_LABEL[op.table] ?? op.table}: ${op.kind === 'delete' ? 'borrar' : 'guardar'}${what ? ` “${what}”` : ''}`
}

// "N pendientes" (spec §3.4): cambios que todavía no se subieron. Oculto en 0; al tocarlo lista cuáles.
function Pending() {
  const [ops, setOps] = useState([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const load = () => pending().then(setOps)
    load()
    return onQueueChange(load)
  }, [])
  if (!ops.length) return null
  return (
    <>
      <button class="pending-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{ops.length} pendientes</button>
      {open && (
        <div class="pending-panel">
          <strong>Falta subir (se sube solo con señal)</strong>
          <ul>{ops.map((o) => <li key={o.id}>{describe(o)}</li>)}</ul>
        </div>
      )}
    </>
  )
}

export function TripShell({ id, tab = 'pronostico' }) {
  const [res, setRes] = useState(null)
  const [me, setMeState] = useState(() => getMe(id))
  const [picking, setPicking] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setRes(null)
    loadTrip(id).then((r) => {
      if (!alive) return
      setRes(r)
      // El refresco en segundo plano termina: se relee lo local, sin esperar nada.
      r.refresh?.then(async () => {
        const t = (await listRows('trips', id)).find((x) => x.id === id)
        if (alive && t) setRes((s) => ({ ...s, trip: t }))
      })
    })
    return () => { alive = false }
  }, [id, attempt])

  if (!res) return <main class="page"><p class="muted">Cargando…</p></main>

  if (res.offlineFirstOpen) {
    return (
      <main class="page">
        <h1>Viaje sin descargar</h1>
        <p>Abrí este link una vez con señal para descargar el viaje.</p>
        <button class="btn big" onClick={() => setAttempt((n) => n + 1)}>Reintentar</button>
        <Link class="btn big ghost" href="/">Ir al inicio</Link>
      </main>
    )
  }

  const { trip } = res
  if (!me || picking || !trip.members.includes(me)) {
    return (
      <WhoAreYou
        trip={trip}
        onPick={(name) => {
          setMe(id, name)
          setMeState(name)
          setPicking(false)
        }}
      />
    )
  }

  const Screen = tabScreens[tab] ?? tabScreens.pronostico
  const active = MAS_ITEMS.some(([k]) => k === tab) ? 'mas' : tab
  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar-info">
          <strong class="trip-name">{trip.name}</strong>
          <button class="link" onClick={() => setPicking(true)}>Soy {me}</button>
        </div>
        <Pending />
        {tab !== 'comentarios' && (
          <Link class="btn bug" href={`/t/${id}/comentarios?desde=${tab}`} aria-label="Avisar un error o dejar un comentario">🐞</Link>
        )}
        <Link class="btn sos" href={`/t/${id}/emergencias`} aria-label="Emergencias">SOS</Link>
      </header>
      <main class="page">
        <InstallGuide tripId={id} />
        <PrepareBar tab={tab} />
        <PrepareBanner trip={trip} tripId={id} tab={tab} />
        <Screen trip={trip} me={me} tripId={id} />
      </main>
      <nav class="tabs">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/t/${id}/${key}`} class={key === active ? 'tab on' : 'tab'} data-ico={key}>{label}</Link>
        ))}
      </nav>
    </div>
  )
}
