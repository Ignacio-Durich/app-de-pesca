import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,json,svg,png}'] },
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
