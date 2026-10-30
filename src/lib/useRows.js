import { useCallback, useEffect, useState } from 'preact/hooks'
import { listRows, pull } from './repo.js'
import { makeClient } from './db.js'

// Filas compartidas de una tabla del viaje: primero lo local, después el pull (al abrir y al
// volver a la app). Sin red el pull falla y se ignora. `reload` relee lo local tras escribir.
export function useRows(table, tripId) {
  const [rows, setRows] = useState([])
  const reload = useCallback(() => listRows(table, tripId).then(setRows), [table, tripId])
  useEffect(() => {
    let alive = true
    const refresh = () => pull(makeClient(tripId), table, tripId).then((r) => alive && setRows(r), () => {})
    reload()
    refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [table, tripId, reload])
  return [rows, reload]
}
