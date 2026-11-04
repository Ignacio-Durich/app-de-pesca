// Capa de satélite (spec §3.4): lee de IndexedDB lo que bajó "Preparar viaje". Lo que no está se pide por URL, y
// lo sirve el service worker (sat-v1) en un teléfono que todavía no pasó el satélite a IndexedDB.
// Se importa dinámico, junto con Leaflet, para que no entre en el bundle inicial.
import L from 'leaflet'
import { SAT_TEMPLATE, SAT_ATTRIBUTION } from './tiles.js'
import { satStore } from './satStore.js'
import { SAT_ZMAX } from '../prepare/prepare.js'

const SatLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const url = this.getTileUrl(coords)
    const tile = document.createElement('img')
    tile.alt = ''
    tile.crossOrigin = ''
    tile.onload = () => done(null, tile)
    tile.onerror = (e) => done(e, tile)
    satStore.match(url).catch(() => null).then((bytes) => {
      if (!bytes) return void (tile.src = url)
      const local = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
      tile.addEventListener('load', () => URL.revokeObjectURL(local), { once: true })
      tile.src = local
    })
    return tile
  },
})

// Más allá de z13 agranda la z13.
export const satLayer = (maxZoom) =>
  new SatLayer(SAT_TEMPLATE, { maxNativeZoom: SAT_ZMAX, maxZoom, attribution: SAT_ATTRIBUTION })
