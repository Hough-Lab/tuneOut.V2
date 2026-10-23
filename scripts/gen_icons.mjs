import sharp from 'sharp'

// Logo: the v1 waveform (Tuneouticon-128.svg) in onyx, layered over the popup's
// orb as it renders while listening (scripts/assets/orb-listening.png, a
// transparent capture of src/components/Orb.tsx).
const wavePath = `M14,72.65 c12,-1.2 19,-0.8 23.5,0 a5.5,5.5 0 0 0 3.5,-0.25
  c2.6,-1.25 3,-4.7 5.2,-14.6 c1.4,-6.6 1.9,-8 2.3,-8
  c1,0 1.5,6.2 1.7,8 c0.9,10.4 3.6,41.4 4.9,41.4
  c1.6,0.05 3.3,-45.2 5.9,-45.2 c2,0 2.8,27 5.4,27.1
  c3.5,0.08 7,-45.8 8.7,-45.7 c1.7,0.1 0.1,50.2 3.1,50.4
  c2,0.15 3.5,-23 9.9,-23.8 c2.4,-0.27 2.9,5.5 8,8.25
  c4.2,2.3 9.2,1.35 13.2,0`

// The v1 spikes merge at 48px and below, so those sizes use the same rhythm
// (small up, big down, biggest up, mid down) with fewer, wider-spaced spikes.
const smallWavePath = 'M14,65.5 L40,65.5 L51,50 L62,96 L74,32 L86,88 L96,65.5 L117,65.5'

const MASTER = 512

// `pad` is transparent space per side. The Web Store asks for a 96px icon inside
// the 128px canvas (16px each side); toolbar sizes stay close to full-bleed.
const SIZES = [
  { size: 16, path: smallWavePath, stroke: 12, pad: 0 },
  { size: 32, path: smallWavePath, stroke: 9, pad: 1 },
  { size: 48, path: smallWavePath, stroke: 7.5, pad: 2 },
  // The v1 path's bounding box is off-centre in its 131 box; shift it onto the orb's centre.
  { size: 128, path: wavePath, transform: 'translate(3.85 -1.8)', stroke: 7, pad: 16 },
]

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const waveSvg = ({ path, transform = '', stroke }) => `
<svg width="${MASTER}" height="${MASTER}" viewBox="0 0 131 131" xmlns="http://www.w3.org/2000/svg">
  <path d="${path}" transform="${transform}" fill="none" stroke="#0a100d"
        stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

for (const { size, pad, ...wave } of SIZES) {
  const master = await sharp('scripts/assets/orb-listening.png')
    .resize(MASTER, MASTER)
    .composite([{ input: Buffer.from(waveSvg(wave)) }])
    .png()
    .toBuffer()
  // Trim to the orb's edges first so the padding is exact rather than on top of
  // the render's own margin.
  const inner = size - pad * 2
  const trimmed = await sharp(master).trim().toBuffer()
  await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT, kernel: 'lanczos3' })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: TRANSPARENT })
    .png()
    .toFile(`public/icons/icon${size}.png`)
  console.log(`icon${size}.png written`)
}
