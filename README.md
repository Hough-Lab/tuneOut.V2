# tuneOut v2

Music identification Chrome extension — identifies what's playing in the
current tab using a TypeScript port of the reverse-engineered Shazam
signature algorithm ([ShazamIO](https://github.com/Hough-Lab/ShazamIO)).
No backend, no API keys.

## How it works

1. `chrome.tabCapture` grabs the tab's audio; a Web Audio worklet collects
   16 kHz mono PCM while the tab keeps playing.
2. `src/lib/shazam/` fingerprints the audio (FFT landmark peaks → binary
   signature) and the background service worker POSTs it to Shazam's
   discovery endpoint. Progressive attempts at 4s / 8s / 12s.
3. Matches render in the popup (three.js audio-reactive orb) with
   Spotify / YouTube / Discogs click-throughs, and are saved to
   localStorage history.

## Develop

```bash
nvm use            # Node 22 (.nvmrc)
npm install
npm test           # vitest — signature codec validated byte-for-byte vs Python
npm run build      # dist/ → chrome://extensions → Load unpacked
```

`scripts/gen_fixtures.py` regenerates the ground-truth fixtures from the
Python reference (needs a venv with numpy and the ShazamIO sources copied
into `scripts/_ref/`). `scripts/gen_icons.mjs` regenerates the icon set.

## Manifest

V3. Permissions: `tabCapture`, `storage`, `activeTab`; host: `amp.shazam.com`.
