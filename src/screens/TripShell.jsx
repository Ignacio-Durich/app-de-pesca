import { useEffect, useState } from 'preact/hooks'
import { Link } from '../nav.jsx'
import { listRows } from '../lib/repo.js'
import { loadTrip, getMe, setMe } from '../trips/trips.js'
import { WhoAreYou } from './WhoAreYou.jsx'
import { tabScreens, TABS, MAS_ITEMS } from './tabs.jsx'

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
        <Link class="btn sos" href={`/t/${id}/emergencias`} aria-label="Emergencias">SOS</Link>
      </header>
      <main class="page">
        <Screen trip={trip} me={me} tripId={id} />
      </main>
      <nav class="tabs">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/t/${id}/${key}`} class={key === active ? 'tab on' : 'tab'}>{label}</Link>
        ))}
      </nav>
    </div>
  )
}
