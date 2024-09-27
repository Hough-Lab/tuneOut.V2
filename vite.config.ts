import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      // Polyfill Node.js core modules
      stream: 'stream-browserify',
      buffer: 'buffer',
      util: 'util'
    }
  },
  define: {
    global: 'globalThis', // Vite doesn't provide global by default
    process: {
      env: {} // If `process.env` is used in any libraries
    }
  }
});
