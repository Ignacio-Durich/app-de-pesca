import { usePath } from './nav.jsx'
import { Home } from './screens/Home.jsx'
import { TripShell } from './screens/TripShell.jsx'

export { navigate } from './nav.jsx'

export function App() {
  const path = usePath()
  // /t/<id> (link para compartir) o /t/<id>/<pantalla>
  const m = path.match(/^\/t\/([^/]+)(?:\/([^/]+))?\/?$/)
  return m ? <TripShell key={m[1]} id={decodeURIComponent(m[1])} tab={m[2]} /> : <Home />
}
