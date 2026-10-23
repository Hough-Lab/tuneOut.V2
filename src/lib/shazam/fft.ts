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
