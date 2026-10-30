import { render } from 'preact'
import { App } from './app.jsx'
import { makeClient } from './lib/db.js'
import { startAutoFlush } from './lib/queue.js'
import './styles.css'

startAutoFlush(makeClient)

// Un deploy nuevo toma el control (autoUpdate + skipWaiting + clientsClaim) y borra los archivos viejos:
// se recarga una vez para no seguir con una página que pide chunks que ya no existen (ej. el mapa sin señal).
// Solo si ya había un service worker: en la primera visita el cambio de control no es un deploy.
if (navigator.serviceWorker?.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloaded) (reloaded = true), location.reload()
  })
}
render(<App />, document.getElementById('app'))
