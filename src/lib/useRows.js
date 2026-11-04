import { useCallback, useEffect, useState } from 'preact/hooks'
import { listRows, pull } from './repo.js'
import { makeClient } from './db.js'

// Filas compartidas de una tabla del viaje: primero lo local, después el pull (al abrir y al
// volver a la app). Sin red el pull falla y se ignora. `reload` relee lo local tras escribir.
// `pullNow` trae lo del servidor en el momento (botón): si falla, rechaza y lo local queda como estaba.
// scope: tripId, o nearScope(...) para spots y sondeos (tripId va igual en el header x-trip-id).
export function useRows(table, scope, tripId = scope) {
  const [rows, setRows] = useState([])
  const reload = useCallback(() => listRows(table, scope).then(setRows), [table, scope])
  const pullNow = useCallback(() => pull(makeClient(tripId), table, scope).then(setRows), [table, scope, tripId])
  useEffect(() => {
    let alive = true
    const refresh = () => pull(makeClient(tripId), table, scope).then((r) => alive && setRows(r), () => {})
    reload()
    refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [table, scope, tripId, reload])
  return [rows, reload, pullNow]
}
