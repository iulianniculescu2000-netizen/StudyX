// Analiză simplă a bundle-ului, fără dependențe: listează fișierele din dist/assets după mărime (brut și gzip).
// Rulare: npm run analyze  (după npm run build)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'dist', 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('Nu există dist/assets. Rulează întâi: npm run build');
  process.exit(1);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const files = fs
  .readdirSync(assetsDir)
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => {
    const full = path.join(assetsDir, name);
    const buffer = fs.readFileSync(full);
    return { name, size: buffer.length, gzip: zlib.gzipSync(buffer).length };
  })
  .sort((a, b) => b.size - a.size);

if (files.length === 0) {
  console.error('dist/assets nu conține fișiere .js sau .css.');
  process.exit(1);
}

const total = files.reduce((sum, f) => sum + f.size, 0);
const totalGzip = files.reduce((sum, f) => sum + f.gzip, 0);

console.log('Cele mai mari 25 de fișiere din dist/assets:\n');
for (const f of files.slice(0, 25)) {
  console.log(`${kb(f.size).padStart(11)}  ${kb(f.gzip).padStart(10)} gzip  ${f.name}`);
}
console.log(`\nTotal: ${files.length} fișiere, ${kb(total)} (${kb(totalGzip)} gzip)`);

const BIG = 500 * 1024;
const big = files.filter((f) => f.size > BIG);
if (big.length > 0) {
  console.log(`\nAtenție: ${big.length} fișier(e) peste ${kb(BIG)}: ${big.map((f) => f.name).join(', ')}`);
}
