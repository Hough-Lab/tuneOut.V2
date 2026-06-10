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
