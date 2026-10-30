// "Ir a punto" (spec §2.3, §5): distancia y rumbo hasta un spot; flecha si hay brújula.
import { useEffect, useState } from 'preact/hooks'
import { distanceBearing } from '../map/nav.js'
import { cardinal } from '../score/windows.js'
import { dec } from '../forecast/view.js'

const hasOrientation = () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
// iOS 13+: el permiso se pide con un toque.
const needsAsk = () => hasOrientation() && typeof DeviceOrientationEvent.requestPermission === 'function'

// Rumbo del teléfono (0 = norte). iOS da webkitCompassHeading; el resto solo sirve si el evento es
// absoluto (alpha referido al norte). Con un evento relativo no hay brújula: null.
const headingOf = (e) =>
  e.webkitCompassHeading != null ? e.webkitCompassHeading : e.absolute && e.alpha != null ? (360 - e.alpha) % 360 : null

export const distLabel = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${dec(km, km < 10 ? 2 : 1)} km`)

export function GoTo({ pos, target }) {
  const [compass, setCompass] = useState(() => (!hasOrientation() ? 'none' : needsAsk() ? 'ask' : 'on'))
  const [heading, setHeading] = useState(null)

  useEffect(() => {
    if (compass !== 'on') return
    // Chrome Android manda el absoluto en su propio evento; iOS y el resto en deviceorientation.
    const ev = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    const on = (e) => setHeading(headingOf(e))
    window.addEventListener(ev, on)
    return () => window.removeEventListener(ev, on)
  }, [compass])

  const ask = async () => {
    try {
      setCompass((await DeviceOrientationEvent.requestPermission()) === 'granted' ? 'on' : 'denied')
    } catch {
      setCompass('denied')
    }
  }

  const { km, deg } = distanceBearing(pos.latitude, pos.longitude, target.lat, target.lon)
  return (
    <div class="goto">
      <p class="goto-main">
        {distLabel(km)} · rumbo {Math.round(deg)}° {cardinal(deg)}
      </p>
      {heading != null ? (
        <div class="goto-arrow" style={{ transform: `rotate(${(deg - heading + 360) % 360}deg)` }} role="img" aria-label="Flecha hacia el punto">↑</div>
      ) : (
        <p class="muted small">
          {compass === 'ask' ? 'Para ver la flecha, activá la brújula.' : 'Sin brújula: seguí el rumbo en grados (0° = norte).'}
        </p>
      )}
      {compass === 'ask' && <button class="btn" onClick={ask}>Activar brújula</button>}
    </div>
  )
}
