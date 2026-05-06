/**
 * Icon generation script — run with Node.js
 * Requires: npm install -g sharp-cli  OR  use any image editor
 *
 * This script generates placeholder SVG icons for all required PWA sizes.
 * Replace with your actual brand icons before production deployment.
 *
 * Usage: node generate-icons.js
 */

const fs   = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const COLOR = '#1a237e';
const ACCENT = '#0288d1';

function generateSvg(size) {
  const r = size / 2;
  const fontSize = Math.round(size * 0.35);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="${COLOR}"/>
  <circle cx="${r}" cy="${r}" r="${Math.round(r * 0.6)}" fill="${ACCENT}" opacity="0.3"/>
  <text x="${r}" y="${r + fontSize * 0.35}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">C</text>
</svg>`;
}

SIZES.forEach(size => {
  const svgContent = generateSvg(size);
  const filename   = path.join(__dirname, `icon-${size}x${size}.svg`);
  fs.writeFileSync(filename, svgContent);
  console.log(`Generated: icon-${size}x${size}.svg`);
});

// Badge icon (72x72 monochrome for notification badge)
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <circle cx="36" cy="36" r="36" fill="white"/>
  <text x="36" y="48" font-family="Arial,sans-serif" font-size="36" font-weight="bold" fill="${COLOR}" text-anchor="middle">C</text>
</svg>`;
fs.writeFileSync(path.join(__dirname, 'badge-72x72.svg'), badgeSvg);
console.log('Generated: badge-72x72.svg');
console.log('\nNote: Convert SVGs to PNGs using sharp, imagemagick, or an online tool.');
console.log('Example: npx sharp-cli --input icon-192x192.svg --output icon-192x192.png');
