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
