import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,               // listen on 0.0.0.0 — reachable from LAN devices, not just this machine
    port: 5173,
    strictPort: false,        // falls back to 5174, etc. if 5173 is taken
    allowedHosts: ['.devtunnels.ms'],  // Vite blocks unrecognized Host headers by default; this allows any devtunnel subdomain
    proxy: {
      '/api': {
        target: 'http://localhost:5000',  // stays localhost — runs in Node, not the browser
        changeOrigin: true,
        secure: false,
      }
    }
  }
})