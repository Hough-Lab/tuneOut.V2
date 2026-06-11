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
