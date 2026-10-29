import { useEffect, useState } from 'preact/hooks'

const listeners = new Set()

export function navigate(path) {
  history.pushState(null, '', path)
  listeners.forEach((fn) => fn())
}

function Home() {
  return <h1>App de Pesca</h1>
}

function Trip({ id }) {
  return <h1>Viaje {id}</h1>
}

export function App() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const sync = () => setPath(location.pathname)
    listeners.add(sync)
    addEventListener('popstate', sync)
    return () => {
      listeners.delete(sync)
      removeEventListener('popstate', sync)
    }
  }, [])

  const trip = path.match(/^\/t\/([^/]+)\/?$/)
  return trip ? <Trip id={decodeURIComponent(trip[1])} /> : <Home />
}
