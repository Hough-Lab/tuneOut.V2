# tuneOut v2 Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild tuneOut as a Manifest V3 Chrome extension that fingerprints tab audio with a TS port of the ShazamIO algorithm, recognises via amp.shazam.com, and shows matches + localStorage history in a dark-glassmorphic React popup with a three.js audio-reactive orb.

**Architecture:** Popup (React) captures tab audio via `chrome.tabCapture` → Web Audio at 16 kHz → Int16 PCM → `src/lib/shazam` generates the binary signature → background service worker POSTs it to Shazam's discovery endpoint (host_permissions, no CORS) → popup normalises the response, renders match card, saves to localStorage history. three.js orb driven by an AnalyserNode on the same audio graph.

**Tech Stack:** React 18, TypeScript 5, Vite 5, @crxjs/vite-plugin (MV3), three, vitest.

**Reference sources (read-only, already on disk):**
- `/tmp/ShazamIO/shazamio/algorithm.py` — SignatureGenerator (port target)
- `/tmp/ShazamIO/shazamio/signature.py` — binary encoding (port target)
- `/tmp/ShazamIO/shazamio/misc.py` — endpoint URL + headers
- `/Users/hough/hough-lab/tuneOut-v1/` — v1 extension (icons to reuse)

**Repo:** `/Users/hough/hough-lab/tuneOut.V2` (work on `main`; it has 2 commits, nothing to preserve in `src/`).

**Porting fidelity rule:** Port the Python *exactly*, including its quirk that the 3500–5500 Hz band is unreachable (`elif 5500 < frequency_hz <= 5500`) — peaks outside 250–3500 Hz are skipped. Fixtures are generated from the Python fork, so the TS must match byte-for-byte.

---

## File structure

```
tuneOut.V2/
├── manifest.config.ts          # CRXJS defineManifest (MV3)
├── vite.config.ts              # vite + react + crx + vitest config
├── index.html                  # popup entry
├── scripts/
│   ├── _ref/                   # copied Python reference (fixture generation only, gitignored)
│   └── gen_fixtures.py         # writes tests/fixtures/*.json from Python ground truth
├── tests/fixtures/
│   ├── signature-encode.json   # peaks -> expected data URI
│   └── signature-pipeline.json # PCM (base64 s16le) -> expected data URI
└── src/
    ├── background.ts           # SW: fetch to amp.shazam.com
    ├── main.tsx                # React mount
    ├── App.tsx                 # state machine: idle/listening/match/no-match/error
    ├── styles/global.css       # design tokens + glass styles
    ├── components/
    │   ├── Orb.tsx             # three.js canvas
    │   ├── ListenButton.tsx
    │   ├── MatchCard.tsx
    │   └── HistoryList.tsx
    └── lib/
        ├── shazam/
        │   ├── crc32.ts
        │   ├── fft.ts          # real FFT, 2048 -> 1025 power bins
        │   ├── types.ts        # FrequencyPeak, bands, Signature
        │   ├── encode.ts       # peaks -> binary -> data URI
        │   ├── generator.ts    # SignatureGenerator port
        │   ├── recognize.ts    # payload builder + response -> Track
        │   └── index.ts
        ├── audio/
        │   └── capture.ts      # tabCapture + graph + CaptureSession
        │       (worklet: public/pcm-worklet.js — plain JS, loaded via addModule URL)
        ├── history.ts          # localStorage CRUD, cap 200
        └── links.ts            # spotify/youtube/discogs URL builders
```

---

### Task 1: Scaffold — deps, MV3 manifest, clean starter

**Files:**
- Modify: `package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, `.gitignore`
- Create: `manifest.config.ts`, `src/background.ts`, `src/styles/global.css`
- Delete: `src/App.css`, `src/index.css`, `src/logo.svg`, `src/favicon.svg`

- [ ] **Step 1: Install toolchain**

```bash
cd /Users/hough/hough-lab/tuneOut.V2
npm install react@^18.3 react-dom@^18.3
npm install -D typescript@^5.6 vite@^5.4 @vitejs/plugin-react@^4 @crxjs/vite-plugin@^2.0.0-beta.31 @types/react@^18 @types/react-dom@^18 @types/chrome vitest@^2 jsdom@^25 three@^0.170.0 @types/three@^0.170.0
```

(If `npm` fails on node version, `nvm use 22` first.)

- [ ] **Step 2: Write `manifest.config.ts`**

```ts
import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'tuneOut',
  description: 'Identify music playing in the current tab',
  version: '2.0.0',
  action: { default_popup: 'index.html', default_title: 'tuneOut' },
  background: { service_worker: 'src/background.ts', type: 'module' },
  permissions: ['tabCapture', 'storage', 'activeTab'],
  host_permissions: ['https://amp.shazam.com/*'],
  icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
})
```

- [ ] **Step 3: Replace `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  test: { environment: 'jsdom' },
})
```

- [ ] **Step 4: Generate new icons, update entry files**

New icon set inspired by v1 (waveform line inside a circle, see `/Users/hough/hough-lab/tuneOut-v1/icons/Tuneouticon-128.svg`) but in the v2 palette: violet→cyan gradient waveform on a dark-indigo rounded square, soft under-glow.

```bash
npm install -D sharp
rm src/App.css src/index.css src/logo.svg src/favicon.svg
mkdir -p public/icons scripts
```

`scripts/gen_icons.mjs`:

```js
import sharp from 'sharp'

// Waveform path adapted from the v1 icon (Tuneouticon-128.svg), restyled.
const svg = `
<svg width="128" height="128" viewBox="0 0 131 131" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141432"/>
      <stop offset="1" stop-color="#0a0a14"/>
    </linearGradient>
    <linearGradient id="wave" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="127" height="127" rx="30" fill="url(#bg)"/>
  <circle cx="65.5" cy="65.5" r="46" fill="none" stroke="#8b5cf6" stroke-opacity="0.35" stroke-width="7"/>
  <path d="M14,72.65 c12,-1.2 19,-0.8 23.5,0 a5.5,5.5 0 0 0 3.5,-0.25
           c2.6,-1.25 3,-4.7 5.2,-14.6 c1.4,-6.6 1.9,-8 2.3,-8
           c1,0 1.5,6.2 1.7,8 c0.9,10.4 3.6,41.4 4.9,41.4
           c1.6,0.05 3.3,-45.2 5.9,-45.2 c2,0 2.8,27 5.4,27.1
           c3.5,0.08 7,-45.8 8.7,-45.7 c1.7,0.1 0.1,50.2 3.1,50.4
           c2,0.15 3.5,-23 9.9,-23.8 c2.4,-0.27 2.9,5.5 8,8.25
           c4.2,2.3 9.2,1.35 13.2,0"
        fill="none" stroke="#22d3ee" stroke-opacity="0.25" stroke-width="13"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14,72.65 c12,-1.2 19,-0.8 23.5,0 a5.5,5.5 0 0 0 3.5,-0.25
           c2.6,-1.25 3,-4.7 5.2,-14.6 c1.4,-6.6 1.9,-8 2.3,-8
           c1,0 1.5,6.2 1.7,8 c0.9,10.4 3.6,41.4 4.9,41.4
           c1.6,0.05 3.3,-45.2 5.9,-45.2 c2,0 2.8,27 5.4,27.1
           c3.5,0.08 7,-45.8 8.7,-45.7 c1.7,0.1 0.1,50.2 3.1,50.4
           c2,0.15 3.5,-23 9.9,-23.8 c2.4,-0.27 2.9,5.5 8,8.25
           c4.2,2.3 9.2,1.35 13.2,0"
        fill="none" stroke="url(#wave)" stroke-width="6.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

for (const size of [16, 48, 128]) {
  await sharp(Buffer.from(svg), { density: Math.max(72, (size / 128) * 72 * 4) })
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon${size}.png`)
  console.log(`icon${size}.png written`)
}
```

Run: `node scripts/gen_icons.mjs` — Expected: three PNGs in `public/icons/`. Open `public/icons/icon128.png` (Read tool renders images) and sanity-check it looks right: dark rounded square, gradient waveform legible, nothing clipped. Tweak path/strokes if muddy at 16px.

`index.html` (popup is fixed-size):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>tuneOut</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/App.tsx` (placeholder until Task 9):

```tsx
export default function App() {
  return <div className="app">tuneOut</div>
}
```

`src/styles/global.css` (placeholder until Task 9):

```css
body { margin: 0; width: 360px; height: 600px; background: #0a0a14; color: #fff; }
```

`src/background.ts` (placeholder until Task 6):

```ts
export {}
```

Update `package.json` scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "test": "vitest run",
  "preview": "vite preview"
}
```

Update `tsconfig.json` to TS5-era settings:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["chrome", "vite/client"]
  },
  "include": ["src", "manifest.config.ts", "vite.config.ts"]
}
```

(`"build": "tsc && vite build"` relies on `noEmit`. Delete `tsconfig.node.json` reference if `tsconfig.json` had one.)

Append to `.gitignore`:

```
scripts/_ref/
```

- [ ] **Step 5: Verify build + test runner**

```bash
npm run build && npx vitest run --passWithNoTests
```

Expected: `dist/` produced containing `manifest.json` with `"manifest_version": 3`; vitest exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: scaffold MV3 extension with Vite+CRXJS+React+vitest"
```

---

### Task 2: CRC-32

**Files:**
- Create: `src/lib/shazam/crc32.ts`
- Test: `src/lib/shazam/crc32.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shazam/crc32.test.ts
import { describe, it, expect } from 'vitest'
import { crc32 } from './crc32'

describe('crc32', () => {
  it('matches the standard check value for "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789')
    expect(crc32(bytes)).toBe(0xcbf43926)
  })
  it('returns 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shazam/crc32.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// src/lib/shazam/crc32.ts
const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** Standard CRC-32 (IEEE 802.3), same as Python binascii.crc32. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shazam/crc32.test.ts` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shazam && git commit -m "feat: crc32 for shazam signature checksum"
```

---

### Task 3: Real FFT (2048 samples → 1025 power bins)

**Files:**
- Create: `src/lib/shazam/fft.ts`
- Test: `src/lib/shazam/fft.test.ts`

The Python does `fft.rfft(hanning_windowed_2048)` then `(re² + im²) / 2¹⁷`, clamped to ≥1e-10. We implement an in-place iterative radix-2 complex FFT and take bins 0..1024 of the (real-input) spectrum. Windowing stays in the generator (Task 5); `fft.ts` exposes `powerSpectrum(input: Float64Array): Float64Array`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shazam/fft.test.ts
import { describe, it, expect } from 'vitest'
import { powerSpectrum } from './fft'

describe('powerSpectrum', () => {
  it('puts a pure cosine at the right bin with the right power', () => {
    const N = 2048
    const k = 100
    const x = new Float64Array(N)
    for (let n = 0; n < N; n++) x[n] = Math.cos((2 * Math.PI * k * n) / N)
    const p = powerSpectrum(x)
    expect(p.length).toBe(1025)
    // rfft of cos(2πkn/N) has magnitude N/2 at bin k -> power (N/2)^2 / 2^17 = 1024^2/131072 = 8
    expect(p[k]).toBeCloseTo(8, 6)
    // far-away bin is clamped to the floor
    expect(p[500]).toBeCloseTo(1e-10, 12)
  })
  it('handles DC: rfft of all-ones has magnitude N at bin 0', () => {
    const x = new Float64Array(2048).fill(1)
    const p = powerSpectrum(x)
    expect(p[0]).toBeCloseTo((2048 * 2048) / 131072, 6) // = 32
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shazam/fft.test.ts` — Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// src/lib/shazam/fft.ts
const N = 2048
const HALF = N / 2

// Precomputed bit-reversal permutation and twiddle factors for N=2048.
const REV = (() => {
  const bits = Math.log2(N)
  const rev = new Uint16Array(N)
  for (let i = 0; i < N; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r = (r << 1) | ((i >>> b) & 1)
    rev[i] = r
  }
  return rev
})()
const COS = new Float64Array(HALF)
const SIN = new Float64Array(HALF)
for (let i = 0; i < HALF; i++) {
  COS[i] = Math.cos((-2 * Math.PI * i) / N)
  SIN[i] = Math.sin((-2 * Math.PI * i) / N)
}

const re = new Float64Array(N)
const im = new Float64Array(N)

/**
 * Power spectrum of a real 2048-sample frame, matching shazamio:
 * (rfft.real^2 + rfft.imag^2) / 2^17, clamped to >= 1e-10. Returns 1025 bins.
 * The returned array is freshly allocated; internal scratch is reused.
 */
export function powerSpectrum(input: Float64Array): Float64Array {
  for (let i = 0; i < N; i++) {
    re[i] = input[REV[i]]
    im[i] = 0
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1
    const step = N / size
    for (let i = 0; i < N; i += size) {
      for (let j = i, t = 0; j < i + half; j++, t += step) {
        const l = j + half
        const tre = re[l] * COS[t] - im[l] * SIN[t]
        const tim = re[l] * SIN[t] + im[l] * COS[t]
        re[l] = re[j] - tre
        im[l] = im[j] - tim
        re[j] += tre
        im[j] += tim
      }
    }
  }
  const out = new Float64Array(HALF + 1)
  for (let i = 0; i <= HALF; i++) {
    const p = (re[i] * re[i] + im[i] * im[i]) / 131072
    out[i] = p < 1e-10 ? 1e-10 : p
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shazam/fft.test.ts` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shazam/fft.ts src/lib/shazam/fft.test.ts && git commit -m "feat: real FFT power spectrum matching shazamio scaling"
```

### Task 4: Signature types + binary encoding (with Python-generated fixtures)

**Files:**
- Create: `scripts/gen_fixtures.py`, `tests/fixtures/` (generated), `src/lib/shazam/types.ts`, `src/lib/shazam/encode.ts`
- Test: `src/lib/shazam/encode.test.ts`

- [ ] **Step 1: Set up the Python reference and generate ground-truth fixtures**

```bash
cd /Users/hough/hough-lab/tuneOut.V2
mkdir -p scripts/_ref tests/fixtures
cp /tmp/ShazamIO/shazamio/algorithm.py /tmp/ShazamIO/shazamio/signature.py /tmp/ShazamIO/shazamio/enums.py scripts/_ref/
touch scripts/_ref/__init__.py
python3 -m venv /tmp/sigfix-venv && /tmp/sigfix-venv/bin/pip -q install numpy
```

`scripts/gen_fixtures.py`:

```python
"""Generate byte-exact ground-truth fixtures from the ShazamIO Python reference."""
import sys, os, json, base64, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy
from _ref.algorithm import SignatureGenerator
from _ref.signature import DecodedMessage, FrequencyPeak
from _ref.enums import FrequencyBand

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures')

# --- Fixture 1: hand-built peaks -> encoded data URI (exercises 0xff escape too) ---
msg = DecodedMessage()
msg.sample_rate_hz = 16000
msg.number_samples = 48000
msg.frequency_band_to_sound_peaks = {
    FrequencyBand.hz_250_520: [
        FrequencyPeak(46, 7000, 2458, 16000),
        FrequencyPeak(350, 6500, 2500, 16000),  # gap >= 255 -> 0xff escape path
    ],
    FrequencyBand.hz_1450_3500: [FrequencyPeak(100, 7100, 16384, 16000)],
}
with open(os.path.join(OUT, 'signature-encode.json'), 'w') as f:
    json.dump({
        'sampleRateHz': 16000,
        'numberSamples': 48000,
        'bands': {'0': [[46, 7000, 2458], [350, 6500, 2500]], '2': [[100, 7100, 16384]]},
        'uri': msg.encode_to_uri(),
    }, f, indent=1)

# --- Fixture 2: deterministic 4s PCM -> full pipeline signature URI ---
rate, dur = 16000, 4
rng = numpy.random.default_rng(42)
t = numpy.arange(rate * dur) / rate
sig = (
    0.35 * numpy.sin(2 * math.pi * 440 * t)
    + 0.25 * numpy.sin(2 * math.pi * (1000 + 200 * numpy.sin(2 * math.pi * 0.7 * t)) * t)
    + 0.2 * numpy.sin(2 * math.pi * 2500 * t) * (0.5 + 0.5 * numpy.sin(2 * math.pi * 1.3 * t))
    + 0.15 * rng.standard_normal(rate * dur)
)
pcm = numpy.clip(sig * 8000, -32768, 32767).astype('<i2')

gen = SignatureGenerator()
gen.feed_input(pcm.tolist())
gen.MAX_TIME_SECONDS = 8
s = gen.get_next_signature()
total_peaks = sum(len(p) for p in s.frequency_band_to_sound_peaks.values())
assert total_peaks > 10, f'fixture too trivial: {total_peaks} peaks'
with open(os.path.join(OUT, 'signature-pipeline.json'), 'w') as f:
    json.dump({
        'pcmBase64': base64.b64encode(pcm.tobytes()).decode(),
        'numberSamples': s.number_samples,
        'totalPeaks': total_peaks,
        'uri': s.encode_to_uri(),
    }, f, indent=1)
print(f'fixtures written ({total_peaks} peaks in pipeline fixture)')
```

Run: `/tmp/sigfix-venv/bin/python scripts/gen_fixtures.py`
Expected: `fixtures written (N peaks ...)` with N > 10, two JSON files in `tests/fixtures/`. Commit the fixtures (they are the contract); `scripts/_ref/` stays gitignored.

- [ ] **Step 2: Write `src/lib/shazam/types.ts`**

```ts
// Mirrors shazamio's enums.py / signature.py data model.
export enum FrequencyBand {
  hz_250_520 = 0,
  hz_520_1450 = 1,
  hz_1450_3500 = 2,
  hz_3500_5500 = 3, // unreachable in legacy mode — kept for fidelity
}

export interface FrequencyPeak {
  fftPassNumber: number
  peakMagnitude: number
  correctedPeakFrequencyBin: number
}

export interface Signature {
  sampleRateHz: number
  numberSamples: number
  bands: Map<FrequencyBand, FrequencyPeak[]>
}

export interface Track {
  title: string
  artist: string
  album?: string
  artUrl?: string
  isrc?: string
  shazamUrl?: string
  spotifyUrl?: string
}

export interface HistoryEntry extends Track {
  id: string
  foundAt: number // epoch ms
  tabTitle?: string
  tabUrl?: string
}
```

- [ ] **Step 3: Write the failing encode test**

```ts
// src/lib/shazam/encode.test.ts
import { describe, it, expect } from 'vitest'
import fixture from '../../../tests/fixtures/signature-encode.json'
import { encodeSignatureToUri } from './encode'
import { FrequencyBand, type Signature } from './types'

describe('encodeSignatureToUri', () => {
  it('byte-for-byte matches the Python reference output', () => {
    const sig: Signature = {
      sampleRateHz: fixture.sampleRateHz,
      numberSamples: fixture.numberSamples,
      bands: new Map(
        Object.entries(fixture.bands).map(([band, peaks]) => [
          Number(band) as FrequencyBand,
          (peaks as number[][]).map(([fftPassNumber, peakMagnitude, correctedPeakFrequencyBin]) => ({
            fftPassNumber,
            peakMagnitude,
            correctedPeakFrequencyBin,
          })),
        ]),
      ),
    }
    expect(encodeSignatureToUri(sig)).toBe(fixture.uri)
  })
})
```

(Vitest resolves JSON imports natively; add `"resolveJsonModule": true` to tsconfig compilerOptions.)

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/shazam/encode.test.ts` — Expected: FAIL (encode.ts not found)

- [ ] **Step 5: Implement `src/lib/shazam/encode.ts`**

```ts
import { crc32 } from './crc32'
import type { Signature } from './types'

export const DATA_URI_PREFIX = 'data:audio/vnd.shazam.sig;base64,'

/** Port of DecodedMessage.encode_to_binary (signature.py). All little-endian. */
export function encodeSignatureToBinary(sig: Signature): Uint8Array {
  const pushU32 = (arr: number[], v: number) => {
    arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  }

  const contents: number[] = []
  const sortedBands = [...sig.bands.entries()].sort(([a], [b]) => a - b)
  for (const [band, peaks] of sortedBands) {
    const peakBytes: number[] = []
    let fftPassNumber = 0
    for (const peak of peaks) {
      if (peak.fftPassNumber < fftPassNumber) throw new Error('peaks must be sorted by fft pass')
      if (peak.fftPassNumber - fftPassNumber >= 255) {
        peakBytes.push(0xff)
        pushU32(peakBytes, peak.fftPassNumber)
        fftPassNumber = peak.fftPassNumber
      }
      peakBytes.push(peak.fftPassNumber - fftPassNumber)
      peakBytes.push(peak.peakMagnitude & 0xff, (peak.peakMagnitude >>> 8) & 0xff)
      peakBytes.push(peak.correctedPeakFrequencyBin & 0xff, (peak.correctedPeakFrequencyBin >>> 8) & 0xff)
      fftPassNumber = peak.fftPassNumber
    }
    pushU32(contents, 0x60030040 + band)
    pushU32(contents, peakBytes.length)
    contents.push(...peakBytes)
    for (let i = 0; i < (4 - (peakBytes.length % 4)) % 4; i++) contents.push(0)
  }

  // 48-byte header (RawSignatureHeader)
  const header = new Uint8Array(48)
  const dv = new DataView(header.buffer)
  dv.setUint32(0, 0xcafe2580, true) // magic1
  // crc32 at offset 4 written last
  dv.setUint32(8, contents.length + 8, true) // size_minus_header
  dv.setUint32(12, 0x94119c00, true) // magic2
  dv.setUint32(28, 3 << 27, true) // shifted_sample_rate_id (3 = 16000 Hz)
  dv.setUint32(40, Math.trunc(sig.numberSamples + sig.sampleRateHz * 0.24), true)
  dv.setUint32(44, (15 << 19) + 0x40000, true) // fixed_value

  const tlvIntro: number[] = []
  pushU32(tlvIntro, 0x40000000)
  pushU32(tlvIntro, contents.length + 8)

  const out = new Uint8Array(48 + tlvIntro.length + contents.length)
  out.set(header, 0)
  out.set(tlvIntro, 48)
  out.set(contents, 56)
  new DataView(out.buffer).setUint32(4, crc32(out.subarray(8)), true)
  return out
}

export function encodeSignatureToUri(sig: Signature): string {
  const bin = encodeSignatureToBinary(sig)
  let ascii = ''
  for (let i = 0; i < bin.length; i += 0x8000) {
    ascii += String.fromCharCode(...bin.subarray(i, i + 0x8000))
  }
  return DATA_URI_PREFIX + btoa(ascii)
}
```

(Remove the stray `void chunks`/`chunks` scratch if unused after writing — keep the file clean.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/shazam/encode.test.ts` — Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/gen_fixtures.py tests/fixtures src/lib/shazam tsconfig.json
git commit -m "feat: shazam signature binary encoding, validated against ShazamIO fixtures"
```

---

### Task 5: SignatureGenerator port (DSP)

**Files:**
- Create: `src/lib/shazam/generator.ts`, `src/lib/shazam/index.ts`
- Test: `src/lib/shazam/generator.test.ts`

This is an exact port of `algorithm.py`. Every constant, offset list, and mutation order matters — the test is byte-equality of the final URI against the Python pipeline fixture.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shazam/generator.test.ts
import { describe, it, expect } from 'vitest'
import fixture from '../../../tests/fixtures/signature-pipeline.json'
import { SignatureGenerator } from './generator'
import { encodeSignatureToUri } from './encode'

function pcmFromBase64(b64: string): Int16Array {
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new Int16Array(bytes.buffer) // little-endian platform assumption (fine for x86/ARM)
}

describe('SignatureGenerator', () => {
  it('reproduces the Python reference signature byte-for-byte', () => {
    const pcm = pcmFromBase64(fixture.pcmBase64)
    const gen = new SignatureGenerator()
    gen.maxTimeSeconds = 8
    gen.feedInput(pcm)
    const sig = gen.getNextSignature()
    expect(sig).not.toBeNull()
    expect(sig!.numberSamples).toBe(fixture.numberSamples)
    const totalPeaks = [...sig!.bands.values()].reduce((n, p) => n + p.length, 0)
    expect(totalPeaks).toBe(fixture.totalPeaks)
    expect(encodeSignatureToUri(sig!)).toBe(fixture.uri)
  })

  it('returns null when fed fewer than 128 samples', () => {
    const gen = new SignatureGenerator()
    gen.feedInput(new Int16Array(100))
    expect(gen.getNextSignature()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shazam/generator.test.ts` — Expected: FAIL (generator.ts not found)

- [ ] **Step 3: Implement `src/lib/shazam/generator.ts`**

```ts
import { powerSpectrum } from './fft'
import { FrequencyBand, type FrequencyPeak, type Signature } from './types'

// numpy.hanning(2050)[1:-1]: w[i] = 0.5 - 0.5*cos(2*pi*(i+1)/2049), i = 0..2047
const HANNING = (() => {
  const w = new Float64Array(2048)
  for (let i = 0; i < 2048; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 1)) / 2049)
  return w
})()

const NEIGHBOR_OFFSETS = [-10, -7, -4, -3, 1, 2, 5, 8] // range(-10,-3,3) + [-3, 1] + range(2,9,3)
const OTHER_OFFSETS = [-53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249]

class FloatRing {
  buffers: Float64Array[]
  position = 0
  numWritten = 0
  constructor(size: number, width: number) {
    this.buffers = Array.from({ length: size }, () => new Float64Array(width))
  }
  append(value: Float64Array) {
    this.buffers[this.position].set(value)
    this.position = (this.position + 1) % this.buffers.length
    this.numWritten++
  }
  at(index: number): Float64Array {
    const n = this.buffers.length
    return this.buffers[((index % n) + n) % n]
  }
}

/** Port of shazamio's SignatureGenerator (algorithm.py). Input: s16le 16 kHz mono. */
export class SignatureGenerator {
  maxTimeSeconds = 3.1
  maxPeaks = 255

  private input: Int16Array = new Int16Array(0)
  private samplesProcessed = 0

  private samplesRing = new Float64Array(2048)
  private samplesRingPos = 0
  private fftOutputs = new FloatRing(256, 1025)
  private spreadFftOutput = new FloatRing(256, 1025)

  private numberSamples = 0
  private bands = new Map<FrequencyBand, FrequencyPeak[]>()

  feedInput(s16leMonoSamples: Int16Array) {
    const merged = new Int16Array(this.input.length + s16leMonoSamples.length)
    merged.set(this.input, 0)
    merged.set(s16leMonoSamples, this.input.length)
    this.input = merged
  }

  getNextSignature(): Signature | null {
    if (this.input.length - this.samplesProcessed < 128) return null

    while (
      this.input.length - this.samplesProcessed >= 128 &&
      (this.numberSamples / 16000 < this.maxTimeSeconds || this.totalPeaks() < this.maxPeaks)
    ) {
      this.processInput(this.input.subarray(this.samplesProcessed, this.samplesProcessed + 128))
      this.samplesProcessed += 128
    }

    const signature: Signature = {
      sampleRateHz: 16000,
      numberSamples: this.numberSamples,
      bands: this.bands,
    }

    this.numberSamples = 0
    this.bands = new Map()
    this.samplesRing = new Float64Array(2048)
    this.samplesRingPos = 0
    this.fftOutputs = new FloatRing(256, 1025)
    this.spreadFftOutput = new FloatRing(256, 1025)

    return signature
  }

  private totalPeaks(): number {
    let n = 0
    for (const peaks of this.bands.values()) n += peaks.length
    return n
  }

  private processInput(batch: Int16Array) {
    this.numberSamples += batch.length
    this.doFft(batch)
    this.doPeakSpreading()
    if (this.spreadFftOutput.numWritten >= 46) this.doPeakRecognition()
  }

  private scratch = new Float64Array(2048)

  private doFft(batch128: Int16Array) {
    for (let i = 0; i < 128; i++) this.samplesRing[this.samplesRingPos + i] = batch128[i]
    this.samplesRingPos = (this.samplesRingPos + 128) % 2048

    // excerpt = ring[position:] + ring[:position], pre-multiplied by the Hanning window
    const p = this.samplesRingPos
    for (let i = 0; i < 2048 - p; i++) this.scratch[i] = this.samplesRing[p + i] * HANNING[i]
    for (let i = 0; i < p; i++) this.scratch[2048 - p + i] = this.samplesRing[i] * HANNING[2048 - p + i]

    this.fftOutputs.append(powerSpectrum(this.scratch))
  }

  private doPeakSpreading() {
    const origin = this.fftOutputs.at(this.fftOutputs.position - 1)
    const spread = Float64Array.from(origin)

    for (let position = 0; position < 1025; position++) {
      // Frequency-domain spreading
      if (position < 1023) {
        spread[position] = Math.max(spread[position], spread[position + 1], spread[position + 2])
      }
      // Time-domain spreading (mutates stored past frames; max chains across offsets)
      let maxValue = spread[position]
      for (const formerFftNum of [-1, -3, -6]) {
        const former = this.spreadFftOutput.at(this.spreadFftOutput.position + formerFftNum)
        maxValue = Math.max(former[position], maxValue)
        former[position] = maxValue
      }
    }

    this.spreadFftOutput.append(spread)
  }

  private doPeakRecognition() {
    const fftMinus46 = this.fftOutputs.at(this.fftOutputs.position - 46)
    const fftMinus49 = this.spreadFftOutput.at(this.spreadFftOutput.position - 49)

    for (let binPosition = 10; binPosition < 1015; binPosition++) {
      if (!(fftMinus46[binPosition] >= 1 / 64 && fftMinus46[binPosition] >= fftMinus49[binPosition - 1])) continue

      // Frequency-domain local maximum check
      let maxNeighborInFftMinus49 = 0
      for (const offset of NEIGHBOR_OFFSETS) {
        maxNeighborInFftMinus49 = Math.max(fftMinus49[binPosition + offset], maxNeighborInFftMinus49)
      }
      if (!(fftMinus46[binPosition] > maxNeighborInFftMinus49)) continue

      // Time-domain local maximum check
      let maxNeighborInOtherAdjacentFfts = maxNeighborInFftMinus49
      for (const otherOffset of OTHER_OFFSETS) {
        const other = this.spreadFftOutput.at(this.spreadFftOutput.position + otherOffset)
        maxNeighborInOtherAdjacentFfts = Math.max(other[binPosition - 1], maxNeighborInOtherAdjacentFfts)
      }
      if (!(fftMinus46[binPosition] > maxNeighborInOtherAdjacentFfts)) continue

      // This is a peak
      const fftNumber = this.spreadFftOutput.numWritten - 46

      const peakMagnitude = Math.log(Math.max(1 / 64, fftMinus46[binPosition])) * 1477.3 + 6144
      const peakMagnitudeBefore = Math.log(Math.max(1 / 64, fftMinus46[binPosition - 1])) * 1477.3 + 6144
      const peakMagnitudeAfter = Math.log(Math.max(1 / 64, fftMinus46[binPosition + 1])) * 1477.3 + 6144

      const peakVariation1 = peakMagnitude * 2 - peakMagnitudeBefore - peakMagnitudeAfter
      const peakVariation2 = ((peakMagnitudeAfter - peakMagnitudeBefore) * 32) / peakVariation1
      if (peakVariation1 <= 0) throw new Error('unexpected non-positive peak variation')

      const correctedPeakFrequencyBin = binPosition * 64 + peakVariation2
      const frequencyHz = correctedPeakFrequencyBin * (16000 / 2 / 1024 / 64)

      let band: FrequencyBand
      if (frequencyHz > 250 && frequencyHz < 520) band = FrequencyBand.hz_250_520
      else if (frequencyHz > 520 && frequencyHz < 1450) band = FrequencyBand.hz_520_1450
      else if (frequencyHz > 1450 && frequencyHz < 3500) band = FrequencyBand.hz_1450_3500
      else continue // 3500-5500 unreachable in the Python reference; replicated for fidelity

      let peaks = this.bands.get(band)
      if (!peaks) {
        peaks = []
        this.bands.set(band, peaks)
      }
      peaks.push({
        fftPassNumber: fftNumber,
        peakMagnitude: Math.trunc(peakMagnitude),
        correctedPeakFrequencyBin: Math.trunc(correctedPeakFrequencyBin),
      })
    }
  }
}
```

`src/lib/shazam/index.ts`:

```ts
export { SignatureGenerator } from './generator'
export { encodeSignatureToUri, encodeSignatureToBinary, DATA_URI_PREFIX } from './encode'
export * from './types'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shazam/generator.test.ts` — Expected: PASS (byte-identical URI)

If the URI differs: dump both `totalPeaks` and per-band counts first (cheap diagnosis: peak set mismatch = DSP bug in spreading/recognition; same peaks but different bytes = encode/trunc bug). Compare against `python_sig.encode_to_json()` from the reference for the failing band.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run` — Expected: all tests pass (crc32, fft, encode, generator)

- [ ] **Step 6: Commit**

```bash
git add src/lib/shazam && git commit -m "feat: TS port of ShazamIO SignatureGenerator, byte-exact vs Python"
```

### Task 6: Recognition request + response parsing + background service worker

**Files:**
- Create: `src/lib/shazam/recognize.ts`
- Modify: `src/background.ts`, `src/lib/shazam/index.ts`
- Test: `src/lib/shazam/recognize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shazam/recognize.test.ts
import { describe, it, expect } from 'vitest'
import { buildRecognizeUrl, buildRecognizePayload, parseTrack } from './recognize'

const sampleResponse = {
  matches: [{ id: '123', offset: 10 }],
  track: {
    key: '123',
    title: 'Midnight City',
    subtitle: 'M83',
    isrc: 'FR6V81162797',
    url: 'https://www.shazam.com/track/123/midnight-city',
    images: { coverart: 'https://is1-ssl.mzstatic.com/cover.jpg' },
    sections: [
      { type: 'SONG', metadata: [{ title: 'Album', text: 'Hurry Up, We\'re Dreaming' }] },
    ],
    hub: {
      providers: [
        {
          type: 'SPOTIFY',
          actions: [{ type: 'uri', uri: 'spotify:search:Midnight City M83' }],
        },
      ],
    },
  },
}

describe('buildRecognizeUrl', () => {
  it('hits the amp.shazam.com discovery endpoint with two uppercase UUIDs', () => {
    const url = buildRecognizeUrl()
    expect(url).toMatch(
      /^https:\/\/amp\.shazam\.com\/discovery\/v5\/en\/GB\/iphone\/-\/tag\/[0-9A-F-]{36}\/[0-9A-F-]{36}\?sync=true/,
    )
    expect(url).toContain('shazamapiversion=v3')
  })
})

describe('buildRecognizePayload', () => {
  it('matches ShazamIO Converter.data_search shape', () => {
    const p = buildRecognizePayload('data:audio/vnd.shazam.sig;base64,AAAA', 4000)
    expect(p.signature).toEqual({ uri: 'data:audio/vnd.shazam.sig;base64,AAAA', samplems: 4000 })
    expect(typeof p.timezone).toBe('string')
    expect(typeof p.timestamp).toBe('number')
    expect(p.context).toEqual({})
    expect(p.geolocation).toEqual({})
  })
})

describe('parseTrack', () => {
  it('normalises a match', () => {
    const t = parseTrack(sampleResponse)
    expect(t).toEqual({
      title: 'Midnight City',
      artist: 'M83',
      album: "Hurry Up, We're Dreaming",
      artUrl: 'https://is1-ssl.mzstatic.com/cover.jpg',
      isrc: 'FR6V81162797',
      shazamUrl: 'https://www.shazam.com/track/123/midnight-city',
      spotifyUrl: 'https://open.spotify.com/search/Midnight%20City%20M83',
    })
  })
  it('returns null when there are no matches', () => {
    expect(parseTrack({ matches: [] })).toBeNull()
    expect(parseTrack({})).toBeNull()
  })
  it('survives missing optional fields', () => {
    const t = parseTrack({ matches: [{}], track: { title: 'X', subtitle: 'Y' } })
    expect(t).toEqual({
      title: 'X', artist: 'Y', album: undefined, artUrl: undefined,
      isrc: undefined, shazamUrl: undefined, spotifyUrl: undefined,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shazam/recognize.test.ts` — Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/lib/shazam/recognize.ts`**

```ts
import type { Track } from './types'

// ShazamUrl.SEARCH_FROM_FILE from shazamio misc.py (whitespace cleaned)
export function buildRecognizeUrl(): string {
  const a = crypto.randomUUID().toUpperCase()
  const b = crypto.randomUUID().toUpperCase()
  return (
    `https://amp.shazam.com/discovery/v5/en/GB/iphone/-/tag/${a}/${b}` +
    '?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3' +
    '&sharehub=true&hubv5minorversion=v5.1&hidelb=true&video=v3'
  )
}

// Converter.data_search from shazamio converter.py
export function buildRecognizePayload(uri: string, samplems: number) {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    signature: { uri, samplems },
    timestamp: Date.now(),
    context: {},
    geolocation: {},
  }
}

export const SHAZAM_HEADERS = {
  'X-Shazam-Platform': 'IPHONE',
  'X-Shazam-AppVersion': '14.1.0',
  Accept: '*/*',
  'Content-Type': 'application/json',
}

/** Normalise Shazam's response into our Track, or null for no match. */
export function parseTrack(response: unknown): Track | null {
  const r = response as any
  if (!r?.matches?.length || !r.track) return null
  const track = r.track

  let album: string | undefined
  for (const section of track.sections ?? []) {
    for (const meta of section.metadata ?? []) {
      if (meta.title === 'Album') album = meta.text
    }
  }

  let spotifyUrl: string | undefined
  const spotify = (track.hub?.providers ?? []).find((p: any) => p.type === 'SPOTIFY')
  const spotifyAction = spotify?.actions?.find((a: any) => typeof a.uri === 'string')
  if (spotifyAction?.uri?.startsWith('spotify:search:')) {
    spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(
      spotifyAction.uri.slice('spotify:search:'.length),
    )}`
  } else if (spotifyAction?.uri?.startsWith('https://')) {
    spotifyUrl = spotifyAction.uri
  }

  return {
    title: track.title ?? 'Unknown title',
    artist: track.subtitle ?? 'Unknown artist',
    album,
    artUrl: track.images?.coverart,
    isrc: track.isrc,
    shazamUrl: track.url,
    spotifyUrl,
  }
}

/** Popup-side: ask the background service worker to perform the fetch. */
export async function recognizeSignature(uri: string, samplems: number): Promise<Track | null> {
  const response = await chrome.runtime.sendMessage({ type: 'recognize', uri, samplems })
  if (response?.error) throw new Error(response.error)
  return parseTrack(response)
}
```

Add to `src/lib/shazam/index.ts`:

```ts
export { recognizeSignature, parseTrack } from './recognize'
```

- [ ] **Step 4: Implement the service worker — replace `src/background.ts`**

```ts
import { buildRecognizeUrl, buildRecognizePayload, SHAZAM_HEADERS } from './lib/shazam/recognize'

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'recognize') return
  ;(async () => {
    const res = await fetch(buildRecognizeUrl(), {
      method: 'POST',
      headers: SHAZAM_HEADERS,
      body: JSON.stringify(buildRecognizePayload(msg.uri, msg.samplems)),
    })
    if (!res.ok) throw new Error(`Shazam responded ${res.status}`)
    return res.json()
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: e instanceof Error ? e.message : String(e) }))
  return true // keep the message channel open for the async response
})
```

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run && npm run build` — Expected: tests pass, build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/lib/shazam src/background.ts
git commit -m "feat: shazam recognition request/parsing + background fetch"
```

---

### Task 7: Audio capture (tabCapture → 16 kHz PCM + analyser)

**Files:**
- Create: `public/pcm-worklet.js`, `src/lib/audio/capture.ts`

No unit test (requires Chrome `tabCapture` + real AudioContext); verified by type-check now and the E2E checklist in Task 12.

- [ ] **Step 1: Write `public/pcm-worklet.js`** (plain JS — `audioWorklet.addModule` loads it by URL at runtime, outside the bundle)

```js
// Collects mono Float32 PCM chunks and posts them to the main thread.
class PcmCollector extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0]
    if (channels && channels.length > 0 && channels[0].length > 0) {
      const len = channels[0].length
      const mono = new Float32Array(len)
      for (let c = 0; c < channels.length; c++) {
        const ch = channels[c]
        for (let i = 0; i < len; i++) mono[i] += ch[i] / channels.length
      }
      this.port.postMessage(mono, [mono.buffer])
    }
    return true
  }
}
registerProcessor('pcm-collector', PcmCollector)
```

- [ ] **Step 2: Write `src/lib/audio/capture.ts`**

```ts
export interface CaptureSession {
  /** Live analyser for visuals (FFT of the tab audio). */
  analyser: AnalyserNode
  /** All audio captured so far as s16le 16 kHz mono. */
  getPcm(): Int16Array
  durationSeconds(): number
  stop(): void
}

/**
 * Capture the current tab's audio. The AudioContext is created at 16 kHz so
 * Chrome resamples for us — the worklet output is already signature-ready.
 * Audio is routed back to the speakers (tabCapture mutes the tab otherwise).
 */
export async function startCapture(): Promise<CaptureSession> {
  const stream = await new Promise<MediaStream>((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (s) => {
      if (chrome.runtime.lastError || !s) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Could not capture tab audio'))
      } else {
        resolve(s)
      }
    })
  })

  const ctx = new AudioContext({ sampleRate: 16000 })
  await ctx.audioWorklet.addModule('/pcm-worklet.js')

  const source = ctx.createMediaStreamSource(stream)
  const worklet = new AudioWorkletNode(ctx, 'pcm-collector')
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.7

  const chunks: Float32Array[] = []
  let totalSamples = 0
  worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
    chunks.push(e.data)
    totalSamples += e.data.length
  }

  source.connect(worklet)
  source.connect(analyser)
  source.connect(ctx.destination) // keep the tab audible while capturing

  let stopped = false
  return {
    analyser,
    durationSeconds: () => totalSamples / 16000,
    getPcm() {
      const pcm = new Int16Array(totalSamples)
      let offset = 0
      for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) {
          const v = Math.round(chunk[i] * 32768)
          pcm[offset + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v
        }
        offset += chunk.length
      }
      return pcm
    },
    stop() {
      if (stopped) return
      stopped = true
      worklet.port.onmessage = null
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    },
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build` — Expected: success (worklet file lands in `dist/` from `public/`; verify with `ls dist/pcm-worklet.js`)

- [ ] **Step 4: Commit**

```bash
git add public/pcm-worklet.js src/lib/audio
git commit -m "feat: tab audio capture to 16kHz PCM via AudioWorklet"
```

---

### Task 8: History (localStorage) + click-through links

**Files:**
- Create: `src/lib/history.ts`, `src/lib/links.ts`
- Test: `src/lib/history.test.ts`, `src/lib/links.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/history.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getHistory, addEntry, removeEntry, clearHistory, MAX_ENTRIES } from './history'
import type { HistoryEntry } from './shazam/types'

const entry = (id: string): HistoryEntry => ({
  id, title: `t${id}`, artist: 'a', foundAt: Number(id),
})

describe('history', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty', () => {
    expect(getHistory()).toEqual([])
  })
  it('adds newest first and persists', () => {
    addEntry(entry('1'))
    addEntry(entry('2'))
    expect(getHistory().map((e) => e.id)).toEqual(['2', '1'])
  })
  it('caps at MAX_ENTRIES with FIFO eviction', () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) addEntry(entry(String(i)))
    const h = getHistory()
    expect(h.length).toBe(MAX_ENTRIES)
    expect(h[0].id).toBe(String(MAX_ENTRIES + 4)) // newest kept
  })
  it('removes by id and clears all', () => {
    addEntry(entry('1'))
    addEntry(entry('2'))
    removeEntry('1')
    expect(getHistory().map((e) => e.id)).toEqual(['2'])
    clearHistory()
    expect(getHistory()).toEqual([])
  })
  it('returns [] on corrupt storage instead of throwing', () => {
    localStorage.setItem('tuneout:history', '{not json')
    expect(getHistory()).toEqual([])
  })
})
```

```ts
// src/lib/links.test.ts
import { describe, it, expect } from 'vitest'
import { spotifyUrl, youtubeUrl, discogsUrl } from './links'

const track = { title: 'Midnight City', artist: 'M83' }

describe('links', () => {
  it('builds youtube search url', () => {
    expect(youtubeUrl(track)).toBe(
      'https://www.youtube.com/results?search_query=M83%20Midnight%20City',
    )
  })
  it('builds discogs release search url', () => {
    expect(discogsUrl(track)).toBe(
      'https://www.discogs.com/search/?q=M83%20Midnight%20City&type=release',
    )
  })
  it('prefers a direct spotify url from the track when present', () => {
    expect(spotifyUrl({ ...track, spotifyUrl: 'https://open.spotify.com/track/x' })).toBe(
      'https://open.spotify.com/track/x',
    )
  })
  it('falls back to spotify search', () => {
    expect(spotifyUrl(track)).toBe('https://open.spotify.com/search/M83%20Midnight%20City')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/history.test.ts src/lib/links.test.ts` — Expected: FAIL (modules not found)

- [ ] **Step 3: Implement**

```ts
// src/lib/history.ts
import type { HistoryEntry } from './shazam/types'

const KEY = 'tuneout:history'
export const MAX_ENTRIES = 200

export function getHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(entries: HistoryEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries))
}

export function addEntry(entry: HistoryEntry): HistoryEntry[] {
  const entries = [entry, ...getHistory()].slice(0, MAX_ENTRIES)
  save(entries)
  return entries
}

export function removeEntry(id: string): HistoryEntry[] {
  const entries = getHistory().filter((e) => e.id !== id)
  save(entries)
  return entries
}

export function clearHistory(): HistoryEntry[] {
  save([])
  return []
}
```

```ts
// src/lib/links.ts
import type { Track } from './shazam/types'

const q = (t: Pick<Track, 'title' | 'artist'>) => encodeURIComponent(`${t.artist} ${t.title}`)

export const youtubeUrl = (t: Pick<Track, 'title' | 'artist'>) =>
  `https://www.youtube.com/results?search_query=${q(t)}`

export const discogsUrl = (t: Pick<Track, 'title' | 'artist'>) =>
  `https://www.discogs.com/search/?q=${q(t)}&type=release`

export const spotifyUrl = (t: Pick<Track, 'title' | 'artist' | 'spotifyUrl'>) =>
  t.spotifyUrl ?? `https://open.spotify.com/search/${q(t)}`
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/history.test.ts src/lib/links.test.ts` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/history.ts src/lib/history.test.ts src/lib/links.ts src/lib/links.test.ts
git commit -m "feat: localStorage history + spotify/youtube/discogs links"
```

### Task 9: UI shell — design tokens, App state machine, ListenButton

**Files:**
- Create: `src/components/ListenButton.tsx`
- Modify: `src/styles/global.css`, `src/App.tsx`, `src/main.tsx`, `package.json`

UI tasks are verified by `npm run build` + visual check in Task 12; component logic is thin by design (all logic lives in tested libs). `Orb`, `MatchCard`, `HistoryList` are stubbed here and implemented in Tasks 10–11 so this task builds standalone.

- [ ] **Step 1: Install the bundled font** (MV3 forbids remote fonts)

```bash
npm install @fontsource-variable/outfit
```

Add to the top of `src/main.tsx`:

```ts
import '@fontsource-variable/outfit'
```

- [ ] **Step 2: Replace `src/styles/global.css` with the design system**

```css
:root {
  --bg: #0a0a14;
  --bg-glow-1: rgba(139, 92, 246, 0.14);
  --bg-glow-2: rgba(34, 211, 238, 0.1);
  --glass: rgba(255, 255, 255, 0.05);
  --glass-strong: rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.1);
  --text: #f2f2fa;
  --text-dim: #8e8ea8;
  --violet: #8b5cf6;
  --cyan: #22d3ee;
  --gradient: linear-gradient(135deg, var(--violet), var(--cyan));
  --danger: #f87171;
  --radius: 16px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  width: 360px;
  height: 600px;
  overflow: hidden;
  font-family: 'Outfit Variable', system-ui, sans-serif;
  color: var(--text);
  background:
    radial-gradient(420px 280px at 20% -10%, var(--bg-glow-1), transparent 70%),
    radial-gradient(420px 280px at 90% 30%, var(--bg-glow-2), transparent 70%),
    var(--bg);
}

#root, .app { height: 100%; }

.app { display: flex; flex-direction: column; padding: 16px 16px 0; }

.app-header { display: flex; align-items: baseline; justify-content: space-between; }

.logo {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: var(--gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.stage {
  position: relative;
  height: 240px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-card {
  background: var(--glass);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  backdrop-filter: blur(14px);
}

.listen-button {
  appearance: none;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  padding: 12px 28px;
  margin: 4px auto 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  font: inherit;
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
  background: var(--glass-strong);
  backdrop-filter: blur(14px);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.3s ease;
}
.listen-button:hover { transform: scale(1.04); box-shadow: 0 0 24px var(--bg-glow-1); }
.listen-button:disabled { cursor: default; transform: none; }

.listen-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--gradient);
}
.listening .listen-dot { animation: pulse 1.1s ease-in-out infinite; background: var(--danger); }
@keyframes pulse { 50% { opacity: 0.25; transform: scale(0.7); } }

.status-text { text-align: center; color: var(--text-dim); font-size: 13px; min-height: 18px; margin: 0 0 6px; }
.status-text.error { color: var(--danger); }

.fade-in { animation: fadeIn 0.35s ease both; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } }
```

- [ ] **Step 3: Write `src/components/ListenButton.tsx`**

```tsx
interface Props {
  phase: 'idle' | 'listening' | 'no-match' | 'error'
  elapsed: number
  onClick: () => void
}

const LABELS: Record<Props['phase'], string> = {
  idle: 'Tap to identify',
  listening: 'Listening',
  'no-match': 'Try again',
  error: 'Try again',
}

export default function ListenButton({ phase, elapsed, onClick }: Props) {
  const listening = phase === 'listening'
  return (
    <button
      type="button"
      className={`listen-button${listening ? ' listening' : ''}`}
      onClick={onClick}
      disabled={listening}
    >
      <span className="listen-dot" />
      {LABELS[phase]}
      {listening && <span>{elapsed.toFixed(0)}s</span>}
    </button>
  )
}
```

- [ ] **Step 4: Replace `src/App.tsx` with the state machine**

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  SignatureGenerator,
  encodeSignatureToUri,
  recognizeSignature,
  type HistoryEntry,
} from './lib/shazam'
import { startCapture, type CaptureSession } from './lib/audio/capture'
import { getHistory, addEntry, removeEntry, clearHistory } from './lib/history'
import Orb from './components/Orb'
import ListenButton from './components/ListenButton'
import MatchCard from './components/MatchCard'
import HistoryList from './components/HistoryList'

type Phase = 'idle' | 'listening' | 'match' | 'no-match' | 'error'

const ATTEMPT_SECONDS = [4, 8, 12]
const WINDOW_SAMPLES = 8 * 16000 // recognition window: most recent 8s

function waitForDuration(session: CaptureSession, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      if (session.durationSeconds() >= seconds) {
        clearInterval(poll)
        resolve()
      }
    }, 100)
  })
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [track, setTrack] = useState<HistoryEntry | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [history, setHistory] = useState(getHistory)
  const [elapsed, setElapsed] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const sessionRef = useRef<CaptureSession | null>(null)

  useEffect(() => () => sessionRef.current?.stop(), [])

  async function listen() {
    setPhase('listening')
    setTrack(null)
    setErrorMessage('')
    setElapsed(0)

    let session: CaptureSession
    try {
      session = await startCapture()
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not capture tab audio')
      setPhase('error')
      return
    }
    sessionRef.current = session
    setAnalyser(session.analyser)
    const ticker = setInterval(() => setElapsed(session.durationSeconds()), 250)

    try {
      for (const target of ATTEMPT_SECONDS) {
        await waitForDuration(session, target)
        let pcm = session.getPcm()
        if (pcm.length > WINDOW_SAMPLES) pcm = pcm.subarray(pcm.length - WINDOW_SAMPLES)
        const generator = new SignatureGenerator()
        generator.maxTimeSeconds = 8
        generator.feedInput(pcm)
        const signature = generator.getNextSignature()
        if (!signature) continue
        const samplems = Math.round((signature.numberSamples / 16000) * 1000)
        const found = await recognizeSignature(encodeSignatureToUri(signature), samplems)
        if (found) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          const entry: HistoryEntry = {
            ...found,
            id: crypto.randomUUID(),
            foundAt: Date.now(),
            tabTitle: tab?.title,
            tabUrl: tab?.url,
          }
          setHistory(addEntry(entry))
          setTrack(entry)
          setPhase('match')
          return
        }
      }
      setPhase('no-match')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Recognition failed')
      setPhase('error')
    } finally {
      clearInterval(ticker)
      session.stop()
      sessionRef.current = null
      setAnalyser(null)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">tuneOut</span>
      </header>

      <div className="stage">
        <Orb phase={phase} analyser={analyser} />
      </div>

      {phase === 'match' && track ? (
        <MatchCard track={track} onListenAgain={listen} />
      ) : (
        <>
          <ListenButton phase={phase === 'match' ? 'idle' : phase} elapsed={elapsed} onClick={listen} />
          <p className={`status-text${phase === 'error' ? ' error' : ''}`}>
            {phase === 'error' && (errorMessage || 'Something went wrong')}
            {phase === 'no-match' && 'No match found — is music playing in this tab?'}
            {phase === 'listening' && 'Identifying tab audio…'}
          </p>
        </>
      )}

      <HistoryList
        entries={history}
        onRemove={(id) => setHistory(removeEntry(id))}
        onClear={() => setHistory(clearHistory())}
      />
    </div>
  )
}
```

- [ ] **Step 5: Stub the not-yet-built components** so the build passes

```tsx
// src/components/Orb.tsx (replaced in Task 10)
export default function Orb(_: { phase: string; analyser: AnalyserNode | null }) {
  return null
}
```

```tsx
// src/components/MatchCard.tsx (replaced in Task 11)
import type { HistoryEntry } from '../lib/shazam'
export default function MatchCard(_: { track: HistoryEntry; onListenAgain: () => void }) {
  return null
}
```

```tsx
// src/components/HistoryList.tsx (replaced in Task 11)
import type { HistoryEntry } from '../lib/shazam'
export default function HistoryList(_: {
  entries: HistoryEntry[]
  onRemove: (id: string) => void
  onClear: () => void
}) {
  return null
}
```

- [ ] **Step 6: Build + tests**

Run: `npm run build && npx vitest run` — Expected: both pass

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: popup UI shell with capture/recognition state machine"
```

---

### Task 10: three.js audio-reactive orb

**Files:**
- Modify: `src/components/Orb.tsx`

The orb: icosahedron with simplex-noise vertex displacement. Idle = slow breathing; listening = displacement driven by the analyser's average level; match = brief glow burst. Fresnel-style violet→cyan fragment shading.

- [ ] **Step 1: Replace `src/components/Orb.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface Props {
  phase: string
  analyser: AnalyserNode | null
}

// Ashima/Gustavson 3D simplex noise (public domain), trimmed.
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vViewDir;
${NOISE_GLSL}
void main() {
  float n = snoise(normal * 1.6 + vec3(uTime * 0.35));
  vDisplacement = n;
  vec3 displaced = position + normal * n * (0.06 + uAmplitude * 0.45);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
uniform float uBurst;
varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec3 violet = vec3(0.545, 0.361, 0.965);
  vec3 cyan = vec3(0.133, 0.827, 0.933);
  float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
  vec3 color = mix(violet, cyan, vDisplacement * 0.5 + 0.5);
  color += fresnel * 0.6 + uBurst * 0.5;
  gl_FragColor = vec4(color, 0.92);
}
`

export default function Orb({ phase, analyser }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const phaseRef = useRef(phase)
  const burstRef = useRef(0)

  analyserRef.current = analyser
  if (phase === 'match' && phaseRef.current !== 'match') burstRef.current = 1
  phaseRef.current = phase

  useEffect(() => {
    const mount = mountRef.current!
    const size = 240
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10)
    camera.position.z = 3.2

    const uniforms = {
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uBurst: { value: 0 },
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
      transparent: true,
    })
    const geometry = new THREE.IcosahedronGeometry(1.05, 32)
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const freqData = new Uint8Array(128)
    let smoothed = 0
    let raf = 0
    const clock = new THREE.Clock()

    const animate = () => {
      raf = requestAnimationFrame(animate)
      uniforms.uTime.value = clock.getElapsedTime()

      let level = 0
      const a = analyserRef.current
      if (a && phaseRef.current === 'listening') {
        a.getByteFrequencyData(freqData)
        let sum = 0
        for (let i = 0; i < freqData.length; i++) sum += freqData[i]
        level = sum / freqData.length / 255
      }
      smoothed += (level - smoothed) * 0.12
      uniforms.uAmplitude.value = smoothed

      burstRef.current = Math.max(0, burstRef.current - 0.02)
      uniforms.uBurst.value = burstRef.current

      mesh.rotation.y += 0.0035
      mesh.rotation.x += 0.0012
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} style={{ width: 240, height: 240 }} />
}
```

- [ ] **Step 2: Build**

Run: `npm run build` — Expected: success. Bundle warning about chunk size from `three` is acceptable.

- [ ] **Step 3: Commit**

```bash
git add src/components/Orb.tsx && git commit -m "feat: audio-reactive three.js orb"
```

### Task 11: MatchCard + HistoryList

**Files:**
- Modify: `src/components/MatchCard.tsx`, `src/components/HistoryList.tsx`, `src/styles/global.css`
- Create: `src/components/ServiceLinks.tsx`

- [ ] **Step 1: Write `src/components/ServiceLinks.tsx`** (shared by match card + history rows)

```tsx
import { spotifyUrl, youtubeUrl, discogsUrl } from '../lib/links'
import type { Track } from '../lib/shazam'

const ICONS = {
  spotify: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.3 14.5a.62.62 0 0 1-.86.2c-2.36-1.44-5.33-1.76-8.83-.96a.62.62 0 1 1-.28-1.21c3.83-.88 7.11-.5 9.76 1.11.3.18.39.57.21.86Zm1.2-2.72a.78.78 0 0 1-1.07.26c-2.7-1.66-6.82-2.14-10.01-1.17a.78.78 0 1 1-.45-1.49c3.65-1.11 8.19-.57 11.27 1.33.37.22.49.7.26 1.07Zm.1-2.83C14.4 9.03 9.05 8.85 5.96 9.79a.93.93 0 1 1-.54-1.79c3.55-1.08 9.44-.87 13.16 1.34a.93.93 0 0 1-.95 1.6Z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.5 12 4.5 12 4.5s-7 0-8.9.6A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.2ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z" />
    </svg>
  ),
  discogs: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  ),
}

export default function ServiceLinks({ track }: { track: Track }) {
  const links = [
    { name: 'Spotify', href: spotifyUrl(track), icon: ICONS.spotify },
    { name: 'YouTube', href: youtubeUrl(track), icon: ICONS.youtube },
    { name: 'Discogs', href: discogsUrl(track), icon: ICONS.discogs },
  ]
  return (
    <span className="service-links">
      {links.map((l) => (
        <a key={l.name} href={l.href} target="_blank" rel="noreferrer" title={`Open on ${l.name}`}>
          {l.icon}
        </a>
      ))}
    </span>
  )
}
```

- [ ] **Step 2: Replace `src/components/MatchCard.tsx`**

```tsx
import type { HistoryEntry } from '../lib/shazam'
import ServiceLinks from './ServiceLinks'

interface Props {
  track: HistoryEntry
  onListenAgain: () => void
}

export default function MatchCard({ track, onListenAgain }: Props) {
  const art = track.artUrl ? (
    <img className="match-art" src={track.artUrl} alt="" />
  ) : (
    <div className="match-art match-art-placeholder" />
  )
  return (
    <div className="glass-card match-card fade-in">
      {track.shazamUrl ? (
        <a href={track.shazamUrl} target="_blank" rel="noreferrer">{art}</a>
      ) : (
        art
      )}
      <div className="match-meta">
        <strong className="match-title">{track.title}</strong>
        <span className="match-artist">{track.artist}</span>
        {track.album && <span className="match-album">{track.album}</span>}
        <div className="match-actions">
          <ServiceLinks track={track} />
          <button type="button" className="text-button" onClick={onListenAgain}>
            Listen again
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/components/HistoryList.tsx`**

```tsx
import { useState } from 'react'
import type { HistoryEntry } from '../lib/shazam'
import ServiceLinks from './ServiceLinks'

interface Props {
  entries: HistoryEntry[]
  onRemove: (id: string) => void
  onClear: () => void
}

function relativeTime(epochMs: number): string {
  const seconds = Math.floor((Date.now() - epochMs) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(epochMs).toLocaleDateString()
}

export default function HistoryList({ entries, onRemove, onClear }: Props) {
  const [confirmingClear, setConfirmingClear] = useState(false)

  if (entries.length === 0) {
    return <p className="history-empty">Identified tracks will appear here.</p>
  }

  return (
    <section className="history">
      <header className="history-header">
        <h2>History</h2>
        {confirmingClear ? (
          <span>
            <button type="button" className="text-button danger" onClick={onClear}>
              Clear all?
            </button>
            <button type="button" className="text-button" onClick={() => setConfirmingClear(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="text-button" onClick={() => setConfirmingClear(true)}>
            Clear
          </button>
        )}
      </header>
      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry.id} className="history-row glass-card">
            {entry.artUrl ? (
              <img className="history-art" src={entry.artUrl} alt="" loading="lazy" />
            ) : (
              <div className="history-art match-art-placeholder" />
            )}
            <div className="history-meta">
              <span className="history-title" title={entry.title}>{entry.title}</span>
              <span className="history-artist" title={entry.artist}>
                {entry.artist} · {relativeTime(entry.foundAt)}
              </span>
            </div>
            <ServiceLinks track={entry} />
            <button
              type="button"
              className="text-button history-remove"
              title="Remove"
              onClick={() => onRemove(entry.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Append component styles to `src/styles/global.css`**

```css
/* Match card */
.match-card { display: flex; gap: 14px; padding: 14px; margin-bottom: 12px; align-items: center; }
.match-art { width: 88px; height: 88px; border-radius: 12px; object-fit: cover; display: block; }
.match-art-placeholder { background: var(--gradient); opacity: 0.5; }
.match-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.match-title { font-size: 16px; line-height: 1.25; }
.match-artist { color: var(--text-dim); font-size: 14px; }
.match-album { color: var(--text-dim); font-size: 12px; }
.match-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }

/* Service links */
.service-links { display: inline-flex; gap: 4px; }
.service-links a {
  display: inline-flex; padding: 6px; border-radius: 8px;
  color: var(--text-dim); transition: color 0.15s, background 0.15s;
}
.service-links a:hover { color: var(--text); background: var(--glass-strong); }

/* History */
.history { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-bottom: 12px; }
.history-header { display: flex; justify-content: space-between; align-items: baseline; }
.history-header h2 {
  font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-dim); margin: 6px 0;
}
.history-list {
  list-style: none; margin: 0; padding: 0 2px 4px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
}
.history-list::-webkit-scrollbar { width: 4px; }
.history-list::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 2px; }
.history-row { display: flex; align-items: center; gap: 10px; padding: 8px; }
.history-art { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.history-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.history-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-artist { font-size: 12px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-remove { opacity: 0; }
.history-row:hover .history-remove { opacity: 1; }
.history-empty { color: var(--text-dim); font-size: 13px; text-align: center; margin-top: 18px; }

/* Text buttons */
.text-button {
  appearance: none; background: none; border: none; padding: 4px 6px;
  font: inherit; font-size: 12px; color: var(--text-dim); cursor: pointer; border-radius: 6px;
}
.text-button:hover { color: var(--text); background: var(--glass-strong); }
.text-button.danger { color: var(--danger); }
```

- [ ] **Step 5: Build + full test suite**

Run: `npm run build && npx vitest run` — Expected: both pass

- [ ] **Step 6: Commit**

```bash
git add src/components src/styles && git commit -m "feat: match card, history list, service click-throughs"
```

---

### Task 12: Final verification + README

**Files:**
- Modify: `README.md` (create — repo has none)

- [ ] **Step 1: Full automated verification**

```bash
cd /Users/hough/hough-lab/tuneOut.V2
npx vitest run && npm run build
ls dist/manifest.json dist/pcm-worklet.js dist/icons/icon128.png
```

Expected: all tests pass; build emits MV3 manifest, worklet, icons.

- [ ] **Step 2: Manual E2E (requires the user or a Chrome session)**

Load `dist/` via `chrome://extensions` → "Load unpacked", then verify:

1. Icon renders in the toolbar (new gradient waveform).
2. Open a YouTube/Spotify-web tab playing a known song → click tuneOut → orb reacts to audio, elapsed counter runs, tab stays audible.
3. Match appears (often at the 4s attempt), card shows art/title/artist/album.
4. Spotify / YouTube / Discogs buttons open correct searches in new tabs.
5. Close + reopen popup → history persists; remove one entry; Clear → confirm flow.
6. Silent tab → friendly error, "Try again" works.
7. Obscure/no-music audio → no-match state after ~12s.

If the human isn't around to verify, note this step as pending in the final report — do not claim E2E passed.

- [ ] **Step 3: Write `README.md`**

```markdown
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
   discovery endpoint.
3. Matches render in the popup (three.js audio-reactive orb) with
   Spotify / YouTube / Discogs click-throughs, and are saved to
   localStorage history.

## Develop

```bash
npm install
npm test          # vitest — signature codec validated byte-for-byte vs Python
npm run build     # dist/ → chrome://extensions → Load unpacked
```

## Manifest

V3. Permissions: `tabCapture`, `storage`, `activeTab`; host: `amp.shazam.com`.
```

- [ ] **Step 4: Final commit**

```bash
git add README.md && git commit -m "docs: v2 README"
```

---

## Self-review notes (already applied)

- Spec coverage: ShazamIO recognition (T2–T6), improved recording (T7), localStorage history (T8, T11), click-throughs (T8, T11), MV3 (T1), facelift + palette (T9, T11), three.js (T10), new icons (T1 step 4). E2E (T12).
- Type consistency: `Track`/`HistoryEntry` defined once in `types.ts`; `maxTimeSeconds` naming consistent between generator and callers; `recognizeSignature(uri, samplems)` matches the SW message contract.
- Known deliberate quirk: 3500–5500 Hz band unreachable — replicates the Python reference so fixtures match.

