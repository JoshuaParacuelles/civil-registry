import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Set by the electron:build script. Electron loads the app from the app:// scheme,
// which the service worker can't cache, so the PWA plugin is left out of that build.
const isElectron = process.env.ELECTRON === '1'

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    secure: false,
  },
} 
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isElectron
      ? []
      : [
          VitePWA({
            // 'prompt' = a new version waits until the app is reopened, so a user in
            // the middle of a form is never reloaded unexpectedly.
            registerType: 'prompt',
            injectRegister: 'auto',
            manifest: false, // we ship our own public/manifest.webmanifest
            workbox: {
              // Cache the WHOLE built app (every lazy page chunk) so any page opens offline.
              globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff,woff2,webmanifest}'],
              maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
              navigateFallback: '/index.html',
              // API calls are never served by the service worker; offline data lives in IndexedDB.
              navigateFallbackDenylist: [/^\/api\//],
              cleanupOutdatedCaches: true,
            },
            devOptions: { enabled: false }, // test with `npm run build && npm run preview`
          }),
        ]),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (id.includes('node_modules/@supabase/')) return 'supabase'
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: ['.devtunnels.ms'],
    proxy: apiProxy,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    allowedHosts: ['.devtunnels.ms'],
    proxy: apiProxy,
  },
})