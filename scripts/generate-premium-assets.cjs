#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sdfSquircle(x, y, size, radius) {
  const half = size / 2;
  const qx = Math.abs(x) - half + radius;
  const qy = Math.abs(y) - half + radius;
  return Math.min(Math.max(qx, qy), 0)
    + Math.sqrt(Math.pow(Math.max(qx, 0), 2) + Math.pow(Math.max(qy, 0), 2))
    - radius;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1;
  const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.sqrt(dx * dx + dy * dy);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function writeBmp(width, height, pixelFunc, outPath) {
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
  const dataSize = rowSize * height;
  const buffer = Buffer.alloc(54 + dataSize);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(54 + dataSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(-height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(dataSize, 34);

  let offset = 54;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFunc(x, y, width, height);
      buffer[offset++] = b;
      buffer[offset++] = g;
      buffer[offset++] = r;
    }
    while ((offset - 54) % rowSize !== 0) buffer[offset++] = 0;
  }

  fs.writeFileSync(outPath, buffer);
}

function blend(base, over, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + over[0] * alpha),
    Math.round(base[1] * (1 - alpha) + over[1] * alpha),
    Math.round(base[2] * (1 - alpha) + over[2] * alpha),
    255,
  ];
}

function drawIconScanlines(size) {
  const leftCover = [[40, 56], [46, 50], [94, 54], [94, 150], [46, 154], [40, 148]];
  const rightCover = [[106, 54], [154, 50], [160, 56], [160, 148], [154, 154], [106, 150]];
  const innerLines = [
    [52, 82, 84, 82],
    [52, 93, 84, 93],
    [52, 104, 72, 104],
  ];
  const pulseSegments = [
    [112, 108, 122, 108],
    [122, 108, 125, 95],
    [125, 95, 128, 76],
    [128, 76, 131, 134],
    [131, 134, 135, 108],
    [135, 108, 152, 108],
  ];

  const scanlines = Buffer.alloc(size * (size * 4 + 1), 0);
  let offset = 0;

  for (let y = 0; y < size; y++) {
    scanlines[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const sx = (x + 0.5) * (200 / size);
      const sy = (y + 0.5) * (200 / size);
      const cx = sx - 100;
      const cy = sy - 100;
      const shell = sdfSquircle(cx, cy, 164, 44);

      if (shell > 0.9) {
        offset += 4;
        continue;
      }

      const gradientT = clamp((sx + sy * 0.82) / 364, 0, 1);
      let color = [
        Math.round(lerp(18, 11, gradientT)),
        Math.round(lerp(18, 14, gradientT)),
        Math.round(lerp(22, 18, gradientT)),
        255,
      ];

      const topGlow = Math.max(0, 1 - Math.hypot(sx - 100, sy - 30) / 82);
      const bottomGlow = Math.max(0, 1 - Math.hypot(sx - 100, sy - 174) / 92);
      color = blend(color, [0, 113, 227], topGlow * 0.18);
      color = blend(color, [0, 113, 227], bottomGlow * 0.08);

      const rimShadow = smoothstep(-9, 4, shell);
      color = blend(color, [8, 8, 12], rimShadow * 0.28);

      if (sy < 56 && shell < -6) {
        const reflection = Math.max(0, 1 - Math.abs(sy - 28) / 24) * 0.18;
        color = blend(color, [255, 255, 255], reflection);
      }

      if (pointInPolygon(sx, sy, leftCover) || pointInPolygon(sx, sy, rightCover)) {
        color = [248, 250, 253, 255];
      }

      if (distanceToSegment(sx, sy, 100, 50, 100, 154) <= 1.15) {
        color = blend(color, [0, 113, 227], 0.55);
      }

      if (Math.hypot(sx - 100, sy - 47) <= 4.8 || Math.hypot(sx - 100, sy - 157) <= 4.8) {
        color = [0, 113, 227, 255];
      }

      for (const [x1, y1, x2, y2] of innerLines) {
        if (distanceToSegment(sx, sy, x1, y1, x2, y2) <= 1.55) {
          color = blend(color, [0, 0, 0], 0.1);
        }
      }

      if (Math.abs(sy - 64.25) <= 1.45 && sx >= 67 && sx <= 79) {
        color = blend(color, [0, 113, 227], 0.52);
      }
      if (Math.abs(sx - 73.25) <= 1.45 && sy >= 58 && sy <= 70) {
        color = blend(color, [0, 113, 227], 0.52);
      }

      for (const [x1, y1, x2, y2] of pulseSegments) {
        if (distanceToSegment(sx, sy, x1, y1, x2, y2) <= 1.55) {
          color = [0, 113, 227, 255];
        }
      }

      scanlines[offset++] = color[0];
      scanlines[offset++] = color[1];
      scanlines[offset++] = color[2];
      scanlines[offset++] = 255;
    }
  }

  return scanlines;
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const payload = data || Buffer.alloc(0);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, payload])));
  return Buffer.concat([len, typeBuffer, payload, crc]);
}

function makePng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(drawIconScanlines(size), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND'),
  ]);
}

function makeIco(pngBuffers) {
  const buffers = Array.isArray(pngBuffers) ? pngBuffers : [pngBuffers];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(buffers.length, 4);

  const entries = [];
  let offset = 6 + buffers.length * 16;

  for (const { size, buffer } of buffers) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...buffers.map((item) => item.buffer)]);
}

function writeIconAssets(rootDir) {
  const png512 = makePng(512);
  const icoSizes = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
    size,
    buffer: makePng(size),
  }));

  fs.writeFileSync(path.join(rootDir, 'public', 'icon.png'), png512);
  fs.writeFileSync(path.join(rootDir, 'public', 'icon.ico'), makeIco(icoSizes));
}

function main() {
  const rootDir = path.join(__dirname, '..');
  // Imaginile expertului de instalare (build/sidebar.bmp, build/header.bmp) vin din scripts/generate-installer-art.py.
  writeIconAssets(rootDir);
  console.log('StudyX premium assets generated successfully.');
}

main();
