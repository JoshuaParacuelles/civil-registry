import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Only used by `npm run dev` and `npm run preview` on your own machine.
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    secure: false,
  },
}

export default defineConfig({
  base: '/',

  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // Registration is handled by PwaUpdatePrompt (useRegisterSW),
      // so the plugin must not inject its own registerSW script.
      injectRegister: null,
      manifest: false, // we ship our own public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // No skipWaiting / clientsClaim: the new version waits until the user accepts the update.
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],

  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
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