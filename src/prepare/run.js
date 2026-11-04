// La descarga de "Preparar viaje" (spec §3.4), fuera de la pantalla: sigue al cambiar de pestaña y no arranca dos veces.
// En iPhone no puede seguir con la app afuera: iOS la congela y no tiene Background Fetch (MDN). Al volver, pregunta
// antes de seguir, porque el iPhone no dice si hay wifi o datos (NetworkInformation: Safari no, Chrome Android sí).
// Mientras espera la respuesta no se pide ninguna tanda más.
import { prepareTrip, SAT_MB_ESTIMATED, DEPTH_MB_PER_TILE } from './prepare.js'

// MB que faltan bajar según el paso. ponytail: en el mapa base no suma la profundidad (~21 MB); lo que ya esté
// guardado o se copie de sat-v1 tampoco se descuenta, por eso se muestra como "hasta unos".
export function mbLeft(p, withSat) {
  const sat = withSat ? SAT_MB_ESTIMATED : 0
  const left = (p?.total ?? 0) - (p?.done ?? 0)
  const mb = {
    forecast: () => sat,
    region: () => left / 1e6 + sat,
    depth: () => left * DEPTH_MB_PER_TILE + sat,
    sat: () => (p.total ? (SAT_MB_ESTIMATED * left) / p.total : 0),
  }[p?.step]?.() ?? 0
  return Math.ceil(mb)
}

const paused = () => Object.assign(new Error('pausada'), { name: 'PausedError' })
const IDLE = { running: false, tripId: null, prog: null, error: null, ask: null }

export function makeRun({ prepare = prepareTrip, doc = globalThis.document, nav = globalThis.navigator, now = Date.now } = {}) {
  let state = IDLE
  let job = null // { trip, withSat } mientras haya una descarga, también si espera la respuesta
  let active = false // prepareTrip está corriendo
  let away = false // salió de la app durante esta corrida
  let stopped = false // contestó "Ahora no"
  let gate = null // la pregunta está abierta: las tandas esperan acá
  let lock = null
  let high = {} // lo más alto de cada paso: al retomar se recuenta lo guardado y el número no vuelve atrás
  let speed = null
  const listeners = new Set()
  const emit = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((fn) => fn(state))
  }
  const hidden = () => doc?.visibilityState === 'hidden'
  const onWifi = () => ['wifi', 'ethernet'].includes(nav?.connection?.type)

  // Bloqueada, el iPhone corta la descarga. Si el teléfono no lo permite no pasa nada: la pantalla igual lo pide.
  const keepAwake = () => nav?.wakeLock?.request('screen').then((l) => (job ? (lock = l) : l.release()), () => {})

  const finish = (error = null) => {
    job = null
    gate = null
    lock?.release().catch(() => {})
    lock = null
    emit({ ...IDLE, error })
  }

  // Minutos que faltan del satélite, con la velocidad de los últimos 15 s (lo ya guardado pasa enseguida y no cuenta).
  const onProgress = (p) => {
    const done = p.total ? Math.max(p.done ?? 0, high[p.step] ?? 0) : p.done
    if (p.total) high[p.step] = done
    let left = null
    if (p.step === 'sat') {
      const t = now(), e = (speed ??= { t, done, left: null }), secs = (t - e.t) / 1000
      if (secs >= 15) {
        const rate = (done - e.done) / secs
        Object.assign(e, { t, done, left: rate > 0 ? Math.ceil((p.total - done) / rate / 60) : null })
      }
      left = e.left
    }
    emit({ prog: { ...p, done, ...(left ? { left } : {}) } })
  }

  const beforeBatch = () => (stopped ? Promise.reject(paused()) : gate?.promise)

  const go = async () => {
    active = true
    away = hidden()
    speed = null
    let error = null, status = null
    try {
      status = await prepare(job.trip, { onProgress, withSat: job.withSat, beforeBatch })
    } catch (e) {
      error = e.message || String(e)
    }
    active = false
    if (stopped || !away || !(error || status.missing.length)) return finish(error)
    // Se cortó por haber salido de la app: espera a que vuelva, o a la respuesta; si ya contestó, sigue.
    if (!hidden() && !state.ask) go()
  }

  const proceed = () => {
    if (!job) return
    gate?.resolve()
    gate = null
    emit({ ask: null })
    if (!active) go()
  }

  const stop = () => {
    if (!job) return
    stopped = true
    gate?.reject(paused())
    gate = null
    emit({ ask: null })
    if (!active) finish()
  }

  const onVisibility = () => {
    if (!job) return
    if (hidden()) return void (away = true)
    keepAwake()
    if (!away) return
    const mb = mbLeft(state.prog, job.withSat)
    if (onWifi() || !mb) return proceed()
    if (active && !gate) {
      gate = {}
      gate.promise = new Promise((resolve, reject) => Object.assign(gate, { resolve, reject }))
      gate.promise.catch(() => {}) // "Ahora no" sin ninguna tanda esperando
    }
    emit({ ask: { mb } })
  }
  doc?.addEventListener('visibilitychange', onVisibility)

  return {
    get: () => state,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    proceed,
    stop,
    start: (trip, withSat) => {
      if (job) return
      job = { trip, withSat }
      stopped = false
      high = {}
      emit({ ...IDLE, running: true, tripId: trip.id, prog: { step: 'forecast' } })
      keepAwake()
      go()
    },
  }
}

export const prepareRun = makeRun()
