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

  private scratch = new Float64Array(2048)

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
