/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    // Vite >=5.4.12 blocks cross-origin dev requests by default; the MV3
    // service worker loads @crx/client-worker from a chrome-extension:// origin.
    cors: { origin: [/chrome-extension:\/\//] },
  },
  legacy: {
    // Same hardening release added a WebSocket token check that breaks CRXJS HMR.
    skipWebSocketTokenCheck: true,
  },
  test: { environment: 'jsdom' },
})
