// One-off icon generator: rasterizes scripts/icon.svg into the PWA PNG icons.
// Run with: node scripts/gen-icons.mjs   (requires `npm i -D sharp`)
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const svg = readFileSync(join(here, 'icon.svg'))

// Maskable icon: same art but shrunk ~20% inside a full-bleed dark background,
// so it survives the safe-zone crop on adaptive icons.
const maskableSvg = Buffer.from(
  `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
     <rect width="512" height="512" fill="#0f0f0f"/>
     <g transform="translate(64,64) scale(0.75)">${readFileSync(join(here, 'icon.svg'))
       .toString()
       .replace(/<\/?svg[^>]*>/g, '')}</g>
   </svg>`
)

async function out(input, size, name) {
  await sharp(input).resize(size, size).png().toFile(join(pub, name))
  console.log('wrote', name)
}

await out(svg, 180, 'apple-touch-icon.png')
await out(svg, 192, 'icon-192.png')
await out(svg, 512, 'icon-512.png')
await out(maskableSvg, 512, 'icon-maskable-512.png')
console.log('done')
