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
