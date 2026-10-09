#!/usr/bin/env node
/**
 * scripts/generate-icon.cjs
 *
 * Generates public/icon.png (512×512 RGBA PNG) — the StudyX app icon.
 * Pure Node.js, no external dependencies.  Uses zlib (built-in) for DEFLATE.
 *
 * Design: iOS-style rounded rectangle, purple→blue diagonal gradient
 *         (#6D28D9 → #2563EB), matching the app's accent colours.
 */
'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const SIZE   = 512;
const RADIUS = 100; // corner radius (iOS icon feel)

// ── CRC-32 (required by the PNG spec for every chunk) ─────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG chunk helper ──────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t  = Buffer.from(type, 'ascii');
  const d  = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const ln = Buffer.allocUnsafe(4); ln.writeUInt32BE(d.length);
  const cr = Buffer.allocUnsafe(4); cr.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([ln, t, d, cr]);
}

// ── Pixel generation ─────────────────────────────────────────────────────────
// Pre-allocate: each row = 1 filter byte + SIZE*4 RGBA bytes
const scanlines = Buffer.alloc(SIZE * (SIZE * 4 + 1), 0);
let off = 0;

for (let y = 0; y < SIZE; y++) {
  scanlines[off++] = 0; // filter = None

  for (let x = 0; x < SIZE; x++) {
    const cx = x - SIZE / 2 + 0.5;
    const cy = y - SIZE / 2 + 0.5;

    // Rounded-rect SDF (signed-distance-field)
    const qx = Math.abs(cx) - (SIZE / 2 - RADIUS);
    const qy = Math.abs(cy) - (SIZE / 2 - RADIUS);
    const inRect   = Math.abs(cx) < SIZE / 2 && Math.abs(cy) < SIZE / 2;
    const inCorner = qx > 0 && qy > 0;
    const inside   = inRect && (!inCorner || qx * qx + qy * qy < RADIUS * RADIUS);

    if (!inside) { off += 4; continue; } // transparent

    // Diagonal gradient  #6D28D9 (top-left) → #2563EB (bottom-right)
    const t  = (x / SIZE * 0.55 + y / SIZE * 0.45);
    let r = Math.round(109 + (37  - 109) * t);
    let g = Math.round(40  + (99  - 40)  * t);
    let b = Math.round(217 + (235 - 217) * t);

    // Soft inner glow (top-left quadrant brightens slightly)
    const nx   = (cx + SIZE / 2) / SIZE;
    const ny   = (cy + SIZE / 2) / SIZE;
    const glow = Math.max(0, 0.38 - Math.sqrt(nx * nx + ny * ny) * 0.55);
    r = Math.min(255, r + Math.round(glow * 70));
    g = Math.min(255, g + Math.round(glow * 50));
    b = Math.min(255, b + Math.round(glow * 35));

    // Subtle edge darkening (gives depth)
    const edge  = Math.min(Math.abs(cx), Math.abs(cy), SIZE / 2 - 1);
    const dark  = Math.max(0, 1 - edge / 18);
    r = Math.max(0, r - Math.round(dark * 25));
    g = Math.max(0, g - Math.round(dark * 18));
    b = Math.max(0, b - Math.round(dark * 15));

    scanlines[off++] = r;
    scanlines[off++] = g;
    scanlines[off++] = b;
    scanlines[off++] = 255; // fully opaque
  }
}

// ── Assemble PNG ─────────────────────────────────────────────────────────────
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA (truecolour + alpha)
// bytes 10-12 = 0 → compression=deflate, filter=adaptive, interlace=none

const idat = zlib.deflateSync(scanlines, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG signature
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', idat),
  pngChunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, '..', 'public', 'icon.png');
fs.writeFileSync(outPath, png);
console.log(`✅  StudyX icon written: ${outPath}  (${(png.length / 1024).toFixed(1)} KB, ${SIZE}×${SIZE}px)`);
