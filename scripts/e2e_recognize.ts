/**
 * Manual E2E: WAV file -> TS signature pipeline -> live amp.shazam.com.
 * Usage: npx vite-node scripts/e2e_recognize.ts -- "/path/to/file.wav" [offsetSeconds]
 * Validates everything except chrome.tabCapture/UI.
 */
import { readFileSync } from 'node:fs'
import { SignatureGenerator } from '../src/lib/shazam/generator'
import { encodeSignatureToUri } from '../src/lib/shazam/encode'
import { buildRecognizeUrl, buildRecognizePayload, SHAZAM_HEADERS, parseTrack } from '../src/lib/shazam/recognize'

const [file, offsetArg] = process.argv.slice(2).filter((a) => a !== '--')
const offsetSeconds = Number(offsetArg ?? 30)

const buf = readFileSync(file)
if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
  throw new Error('not a RIFF/WAVE file')
}

// Walk chunks for fmt + data
let pos = 12
let sampleRate = 0, channels = 0, bitsPerSample = 0, dataStart = -1, dataLen = 0
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4)
  const size = buf.readUInt32LE(pos + 4)
  if (id === 'fmt ') {
    const format = buf.readUInt16LE(pos + 8)
    channels = buf.readUInt16LE(pos + 10)
    sampleRate = buf.readUInt32LE(pos + 12)
    bitsPerSample = buf.readUInt16LE(pos + 22)
    // 1 = PCM, 0xfffe = WAVE_FORMAT_EXTENSIBLE (PCM subtype assumed)
    if (![1, 0xfffe].includes(format) || ![16, 24].includes(bitsPerSample)) {
      throw new Error(`need 16/24-bit PCM, got format=${format} bits=${bitsPerSample}`)
    }
  } else if (id === 'data') {
    dataStart = pos + 8
    dataLen = size
  }
  pos += 8 + size + (size % 2)
}
if (dataStart < 0) throw new Error('no data chunk')
console.log(`wav: ${sampleRate} Hz, ${channels}ch, ${(dataLen / (sampleRate * channels * 2)).toFixed(1)}s`)

// Downmix to mono Float64 (normalised to 16-bit range)
const bytesPerSample = bitsPerSample / 8
const frames = Math.floor(dataLen / bytesPerSample / channels)
const readSample =
  bitsPerSample === 16
    ? (off: number) => buf.readInt16LE(off)
    : (off: number) => {
        const v = buf.readUIntLE(off, 3)
        return ((v > 0x7fffff ? v - 0x1000000 : v) / 0x800000) * 32767
      }
const mono = new Float64Array(frames)
for (let i = 0; i < frames; i++) {
  let acc = 0
  for (let c = 0; c < channels; c++) acc += readSample(dataStart + (i * channels + c) * bytesPerSample)
  mono[i] = acc / channels
}

// Linear resample to 16 kHz, take 8s starting at offsetSeconds
const ratio = sampleRate / 16000
const startFrame = Math.min(Math.floor(offsetSeconds * 16000), Math.max(0, Math.floor(frames / ratio) - 8 * 16000))
const out = new Int16Array(8 * 16000)
for (let i = 0; i < out.length; i++) {
  const srcPos = (startFrame + i) * ratio
  const i0 = Math.floor(srcPos)
  const frac = srcPos - i0
  const v = mono[i0] * (1 - frac) + (mono[i0 + 1] ?? mono[i0]) * frac
  out[i] = Math.max(-32768, Math.min(32767, Math.round(v)))
}

const gen = new SignatureGenerator()
gen.maxTimeSeconds = 8
gen.feedInput(out)
const sig = gen.getNextSignature()
if (!sig) throw new Error('no signature generated')
const peaks = [...sig.bands.values()].reduce((n, p) => n + p.length, 0)
console.log(`signature: ${sig.numberSamples} samples, ${peaks} peaks`)

const uri = encodeSignatureToUri(sig)
const samplems = Math.round((sig.numberSamples / 16000) * 1000)
const res = await fetch(buildRecognizeUrl(), {
  method: 'POST',
  headers: SHAZAM_HEADERS,
  body: JSON.stringify(buildRecognizePayload(uri, samplems)),
})
console.log(`shazam http ${res.status}`)
const json = await res.json()
const track = parseTrack(json)
console.log(track ? `MATCH: ${track.artist} — ${track.title}` : `no match (matches=${json?.matches?.length ?? 'n/a'}, keys=${Object.keys(json).join(',')})`)
