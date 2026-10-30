import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,png}'],
        // Lo que guarda "Preparar viaje" (src/prepare/prepare.js) se sirve desde la Cache API sin señal.
        runtimeCaching: [
          {
            // Anclada al inicio: workbox solo toma rutas de otro origen si el regex matchea desde el índice 0.
            urlPattern: /^https:\/\/[^/]+\/storage\/v1\/object\/public\/catch-photos\//,
            handler: 'CacheFirst',
            options: { cacheName: 'photos-v1', matchOptions: { ignoreVary: true } },
          },
          {
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\//,
            handler: 'CacheFirst',
            options: { cacheName: 'depth-v1', matchOptions: { ignoreVary: true } },
          },
        ],
      },
      manifest: {
        name: 'App de Pesca',
        short_name: 'Pesca',
        display: 'standalone',
        lang: 'es-AR',
        start_url: '/',
        theme_color: '#0b5c7a',
        background_color: '#0b5c7a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
