import sharp from 'sharp'

// Waveform path adapted from the v1 icon (Tuneouticon-128.svg), restyled to
// the v2 palette: violet->cyan gradient waveform on a dark-indigo rounded square.
const wavePath = `M14,72.65 c12,-1.2 19,-0.8 23.5,0 a5.5,5.5 0 0 0 3.5,-0.25
  c2.6,-1.25 3,-4.7 5.2,-14.6 c1.4,-6.6 1.9,-8 2.3,-8
  c1,0 1.5,6.2 1.7,8 c0.9,10.4 3.6,41.4 4.9,41.4
  c1.6,0.05 3.3,-45.2 5.9,-45.2 c2,0 2.8,27 5.4,27.1
  c3.5,0.08 7,-45.8 8.7,-45.7 c1.7,0.1 0.1,50.2 3.1,50.4
  c2,0.15 3.5,-23 9.9,-23.8 c2.4,-0.27 2.9,5.5 8,8.25
  c4.2,2.3 9.2,1.35 13.2,0`

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
  <path d="${wavePath}" fill="none" stroke="#22d3ee" stroke-opacity="0.25" stroke-width="13"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${wavePath}" fill="none" stroke="url(#wave)" stroke-width="6.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

for (const size of [16, 48, 128]) {
  await sharp(Buffer.from(svg), { density: Math.max(72, (size / 128) * 72 * 4) })
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon${size}.png`)
  console.log(`icon${size}.png written`)
}
