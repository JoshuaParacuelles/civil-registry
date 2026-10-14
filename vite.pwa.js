// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pwa from "./vite.pwa.js";

const isElectron = process.env.ELECTRON === "1";

export default defineConfig({
  plugins: [
    react(),
    // Skip the service worker entirely for Electron builds.
    ...(isElectron ? [] : [pwa]),
  ],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});