/*
 * Dataminer icon generator
 *
 * Usage:
 *   node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = __dirname;
const SRC_SVG = path.join(ROOT, 'extension', 'icons', 'icon.svg');
const OUT_DIR = path.join(ROOT, 'extension', 'icons');

const SIZES = [16, 32, 48, 128, 256, 512];

function stripBackground(svgText) {
  // Remove background rectangles by id so we can export transparent logo.
  return svgText
    .replace(/\s*<rect[^>]*\sid="bg(?:Shine|Border)?"[^>]*\/>\s*/g, '\n')
    .trim();
}

function makeDarkForToolbar(svgText) {
  // For toolbar icons: change white fill to dark (black/dark gray) for visibility on light backgrounds
  // Replace fill="#FFFFFF" and fill="white" with dark color
  return svgText
    .replace(/fill="#FFFFFF"/g, 'fill="#1F2937"')  // Dark gray/black
    .replace(/fill="white"/gi, 'fill="#1F2937"')
    .replace(/fill='#FFFFFF'/g, "fill='#1F2937'")
    .replace(/fill='white'/gi, "fill='#1F2937'");
}

async function renderPng(svgText, size, outPath, opts = {}) {
  const density = opts.density ?? 512;
  const background = opts.background; // e.g. { r: 255, g: 255, b: 255, alpha: 1 }

  let pipeline = sharp(Buffer.from(svgText), { density }).resize(size, size, { fit: 'contain' });

  // If a solid background is requested, flatten.
  if (background) {
    pipeline = pipeline.flatten({ background });
  }

  await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outPath);
}

async function renderJpg(svgText, size, outPath) {
  // JPG needs a background.
  const density = 512;
  await sharp(Buffer.from(svgText), { density })
    .resize(size, size, { fit: 'contain' })
    .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
}

async function main() {
  if (!fs.existsSync(SRC_SVG)) {
    throw new Error(`SVG not found: ${SRC_SVG}`);
  }

  const svg = fs.readFileSync(SRC_SVG, 'utf8');
  const svgTransparent = stripBackground(svg);
  const svgTransparentDark = makeDarkForToolbar(svgTransparent); // Dark color for toolbar

  // Ensure output dir exists.
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Generate multi-size icons for Chrome toolbar (transparent, dark color, no background).
  for (const size of SIZES) {
    const out = path.join(OUT_DIR, `dataminer-${size}.png`);
    await renderPng(svgTransparentDark, size, out);
  }

  // Logo for panel (white on blue gradient background).
  await renderPng(svg, 512, path.join(OUT_DIR, 'logo.png'));

  // Transparent logo (for special cases).
  await renderPng(svgTransparent, 512, path.join(OUT_DIR, 'logo_transparent.png'));

  // Optional legacy JPG.
  await renderJpg(svg, 512, path.join(OUT_DIR, 'Logo.jpg'));

  console.log('✅ Dataminer icons generated in:', OUT_DIR);
}

main().catch((err) => {
  console.error('❌ Icon generation failed:', err);
  process.exitCode = 1;
});
