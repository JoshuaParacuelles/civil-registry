import { VitePWA } from 'vite-plugin-pwa'

export default VitePWA({
  registerType: 'autoUpdate',
  manifest: false, // gamiton ang public/manifest.webmanifest
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,jpg,svg,webmanifest}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//], // ayaw i-cache ang API calls
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  },
})