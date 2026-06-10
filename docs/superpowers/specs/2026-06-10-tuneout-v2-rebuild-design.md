# tuneOut v2 — Full Rebuild Design

**Date:** 2026-06-10
**Status:** Approved direction (pure-JS Shazam, React + Vite + CRXJS, dark glassmorphic) + amendment: YouTube/Spotify/Discogs click-throughs via direct search URLs.

## Goal

Rebuild tuneOut as a Manifest V3 Chrome extension that identifies music playing in the current tab using the reverse-engineered Shazam API (algorithm per the Hough-Lab/ShazamIO fork), with a modern dark-glassmorphic UI, a three.js audio-reactive centerpiece, and persistent localStorage match history. No backend, no API keys.

## Architecture

Manifest V3 extension built with React 18 + TypeScript + Vite + CRXJS.

```
popup (React)  ── tabCapture ──► Web Audio graph ──► 16kHz mono PCM
     │                                │
     │                          AnalyserNode ──► three.js orb
     │
     ├── PCM ──► src/lib/shazam (TS signature codec)
     │                │
     │            signature ──► background service worker ──► amp.shazam.com
     │
     └── match ──► localStorage history + match card UI
```

### 1. Audio capture (popup)

- `chrome.tabCapture.capture({ audio: true })` from the popup on user tap.
- Stream routed through `AudioContext`:
  - `MediaStreamAudioSourceNode` → `AudioWorkletNode` collecting raw Float32 PCM, down-mixed to mono and resampled to **16 kHz / 16-bit** (the signature algorithm's required input).
  - Same source → `AnalyserNode` (FFT data for the three.js visuals).
  - Source also connected to `audioContext.destination` so the tab keeps playing audibly during capture (tabCapture mutes the tab otherwise — v1 worked around this with a hidden `<audio>` element).
- **Progressive recognition:** attempt a match at ~4 s of audio; if no match, retry at ~8 s, final attempt at ~12 s. Fast results for easy tracks, deeper sample for hard ones (v1 always waited a fixed 8 s).
- Capture requires the popup to stay open (acceptable: max ~12 s). Tracks and context are torn down cleanly on stop/close.
- Non-audible tab / capture failure → friendly error state.

### 2. Recognition — TS port of the ShazamIO algorithm

- `src/lib/shazam/`: vendored TypeScript implementation of the reverse-engineered Shazam signature generation (reference implementations: Hough-Lab/ShazamIO fork in Python, songrec in Rust). Components:
  - Ring buffer + Hann-windowed FFT over 16 kHz PCM.
  - Frequency-band peak extraction (landmark fingerprinting).
  - Binary signature packing (header, CRC32, base64 data-URI encoding).
  - Request payload builder: signature URI, `samplems`, timezone, geolocation stub — matching what ShazamIO sends.
- POST to Shazam's discovery endpoint (`https://amp.shazam.com/discovery/v5/en/US/android/-/tag/{uuid}/{uuid}` — same endpoint family ShazamIO uses), executed in the **background service worker** with `host_permissions` so CORS does not apply.
- Response parsing into a normalized `Track` type: title, artist, album, album-art URL, ISRC, Shazam URL, any direct provider links (Spotify/Apple Music) present in `hub.providers`.

### 3. Click-throughs (no APIs, no keys)

On the match card and every history row, three icon links:

- **Spotify:** direct link from Shazam's `hub.providers` when present; fallback `https://open.spotify.com/search/{artist} {title}`.
- **YouTube:** `https://www.youtube.com/results?search_query={artist} {title}`.
- **Discogs:** `https://www.discogs.com/search/?q={artist} {title}&type=release`.

All open in a new tab. Search APIs were considered and rejected: they require secrets that cannot be safely embedded in an extension bundle, and Shazam's response already supplies the metadata that makes plain search URLs land correctly.

### 4. History (localStorage)

- `src/lib/history.ts`: typed wrapper over `localStorage` (popup origin — persists for the life of the extension install).
- Entry: `{ id, title, artist, album, artUrl, isrc, shazamUrl, spotifyUrl?, foundAt (epoch ms), tabTitle, tabUrl }`.
- Capped at 200 entries (FIFO eviction).
- UI: scrollable list under the orb — album art thumbnail, title/artist, relative timestamp ("2m ago"), the three click-through icons, per-item delete, clear-all with confirm.

### 5. UI / Design

- Popup ~360 × 600. States: **idle → listening → match | no-match | error**.
- **Dark glassmorphic:** near-black indigo base (`#0a0a14` family), frosted-glass cards (`backdrop-filter: blur`), violet→cyan accent gradient, soft glows. Modern variable font (e.g. Inter/Outfit via bundled woff2 — no remote fonts in MV3).
- **three.js orb** (plain three, no react-three-fiber — keeps bundle lean):
  - Glassy icosahedron, shader vertex displacement.
  - Idle: slow rotation, gentle breathing.
  - Listening: displacement amplitude driven by live `AnalyserNode` FFT bins.
  - Match: brief expansion/glow burst, then settles behind the match card.
  - Renderer disposed properly on popup unmount; capped pixel ratio for popup perf.
- Match card: large album art, title/artist/album, click-through icons, "saved to history" affordance.

### 6. Manifest V3

```json
{
  "manifest_version": 3,
  "action": { "default_popup": "index.html" },
  "background": { "service_worker": "background.ts (built)" },
  "permissions": ["tabCapture", "storage"],
  "host_permissions": ["https://amp.shazam.com/*"]
}
```

(`storage` retained for potential future settings; history itself uses localStorage per requirement.)

## Components

| Unit | Purpose | Interface |
|---|---|---|
| `src/lib/shazam/` | PCM → signature → request payload, response → `Track` | `generateSignature(pcm: Int16Array): Signature`, `recognise(sig): Promise<Track \| null>` (via SW message) |
| `src/lib/audio/` | tabCapture + Web Audio graph, PCM accumulation, analyser handle | `startCapture(): CaptureSession` with `getPcm()`, `analyser`, `stop()` |
| `src/lib/history.ts` | localStorage CRUD, capped | `getHistory()`, `addEntry()`, `removeEntry()`, `clearAll()` |
| `src/components/Orb.tsx` | three.js canvas lifecycle | props: `state`, `analyser?` |
| `src/components/MatchCard.tsx`, `HistoryList.tsx`, `ListenButton.tsx` | UI states | props-driven, no internal fetch |
| `src/background.ts` | service worker: fetch to amp.shazam.com | message: `{type:'recognise', payload}` → `Track \| null` |

## Error handling

- No audible tab / capture denied → error state with guidance ("Play something in this tab first").
- Shazam endpoint failure (network, 4xx/5xx) → retry once, then error state; capture audio is kept so retry doesn't re-record.
- No match after 12 s → no-match state with "Try again".

## Testing

- **Unit (vitest):** signature codec — known 16 kHz PCM fixture → expected signature bytes, generated once from the ShazamIO Python fork as ground truth (byte-for-byte validation). CRC32, bit-packing, peak extraction each tested.
- **Unit:** history wrapper (cap, eviction, parse-safety on corrupt JSON).
- **Manual E2E:** load unpacked, play a known track in a tab, verify match, history persistence across popup reopens, all three click-throughs.

## Risks

- The signature algorithm port is the bulk of the difficulty (~300 lines DSP + bit-packing). Mitigated by two reference implementations and fixture validation against the Python fork.
- Shazam could change/rate-limit the unofficial endpoint; acceptable for a personal-use extension (same risk profile as ShazamIO itself).

## Out of scope

- Any backend or hosted service; OAuth provider integrations (add-to-playlist etc.); options page (v1 had one — nothing to configure yet); Firefox build; mic input (tab audio only, as v1).
