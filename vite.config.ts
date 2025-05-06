import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true
    })
  ]

  //   alias: {
  //     // Polyfill Node.js core modules
  //     stream: 'stream-browserify',
  //     buffer: 'buffer',
  //     util: 'util'
  //   }
  // },
  // define: {
  //   global: 'globalThis', // Vite doesn't provide global by default
  //   process: {
  //     env: {} // If `process.env` is used in any libraries
  //   }
  // },
  // server: {
  //   cors: {
  //     origin: 'chrome-extension://pkmolcjalfibkojkojbijlmljeippcdb',
  //     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  //     credentials: true
  //   }
  // }
});
