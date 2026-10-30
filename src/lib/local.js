import { get, set, del } from 'idb-keyval'

// Capa local (IndexedDB). Claves: forecast:<lat>,<lon> · rows:<table>:<scope> · queue · region:<id> · prepare:<tripId>
export const localGet = (key) => get(key)
export const localSet = (key, value) => set(key, value)
export const localDel = (key) => del(key)

// Serializa leer-modificar-escribir sobre IndexedDB: dos escrituras a la vez no se pisan.
export function makeLock() {
  let tail = Promise.resolve()
  return (fn) => {
    const run = tail.then(fn)
    tail = run.catch(() => {})
    return run
  }
}
