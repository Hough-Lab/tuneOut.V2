import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'tuneOut',
  description: 'Identify music playing in the current tab',
  version: '2.0.1',
  action: { default_popup: 'index.html', default_title: 'tuneOut' },
  background: { service_worker: 'src/background.ts', type: 'module' },
  permissions: ['tabCapture', 'activeTab'],
  host_permissions: ['https://amp.shazam.com/*'],
  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
})
