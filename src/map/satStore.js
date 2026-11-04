// Satélite en IndexedDB, en una base aparte y no en la Cache API. En la Cache API de WebKit cada entrada es un
// archivo, y el primer acceso de la app (incluso pedir su propia página) lee todos los de todos los cachés:
// con 24.688 teselas el iPhone tardó ~39 s en abrir (video del 4/11). Medido el 4/11 en WebKit de Mac, en frío:
// hasta recibir la página 2.892 ms con esas entradas en la Cache API, 9 ms con las mismas en IndexedDB.
import { createStore, get, set } from 'idb-keyval'

// Se abre recién al usarla: el arranque de la app no la toca.
let db
const store = () => (db ??= createStore('sat-tiles', 't'))

// Misma forma que un Cache de la Cache API, la que espera prepareTrip.
export const satStore = {
  match: (url) => get(url, store()),
  put: async (url, res) => set(url, await res.arrayBuffer(), store()),
}
