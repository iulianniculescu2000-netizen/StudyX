// Construiește src/data/ocrCorrections.json: greșeli sistematice de OCR din cărțile incluse (Kumar, Lawrence, Sinopsis).
//
// Metoda: un cuvânt care apare rar și care, printr-o confuzie tipică de OCR, devine un cuvânt mult mai frecvent în aceleași cărți
// este aproape sigur o greșeală de OCR. Confuziile sunt doar cele sistematice (n în loc de u, „ui” în loc de „ul” la final, „l” în
// loc de „i” la început, „eț” în loc de „cț”, „ee” în loc de „ec”, „rn” în loc de „m”): confuziile generale (o/a, c/e, t/f) strică
// cuvinte valide („istorie”/„istoric”, „arteriole”/„arteriale”, „anemic”/„anemie”) și nu se folosesc.
//
// Rulare: node scripts/build-ocr-corrections.mjs   (regenerează fișierul; verifică diff-ul înainte de comitere)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const library = join(root, 'src', 'data', 'rezidentiat', 'library');
const target = join(root, 'src', 'data', 'ocrCorrections.json');

const fold = (word) => word.normalize('NFC').replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț').toLowerCase();
const WORD = /[A-Za-zĂÂÎȘȚăâîșțŞŢşţ]{4,}/g;

const freq = new Map();
for (const file of ['kumar.txt', 'lawrence.txt', 'sinopsis.txt']) {
  const text = readFileSync(join(library, file), 'utf8');
  for (const match of text.matchAll(WORD)) {
    const word = fold(match[0]);
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
}

function candidates(word) {
  const out = new Set();
  for (let i = 0; i < word.length; i += 1) if (word[i] === 'n') out.add(`${word.slice(0, i)}u${word.slice(i + 1)}`);
  if (word.endsWith('ui')) out.add(`${word.slice(0, -2)}ul`);
  if (word.startsWith('l') && word.length > 4) out.add(`i${word.slice(1)}`);
  for (const [from, to] of [['eț', 'cț'], ['ee', 'ec'], ['rn', 'm']]) {
    let at = word.indexOf(from);
    while (at !== -1) {
      out.add(word.slice(0, at) + to + word.slice(at + from.length));
      at = word.indexOf(from, at + 1);
    }
  }
  out.delete(word);
  return out;
}

const corrections = {};
for (const [word, count] of freq) {
  if (word.length < 5) continue;
  const rare = count <= 3;
  const systematic = count >= 4 && count <= 600;
  if (!rare && !systematic) continue;
  let best = null;
  for (const candidate of candidates(word)) {
    const known = freq.get(candidate) ?? 0;
    if (candidate.length < 5) continue; // un fragment („impo”) nu e o corectură
    const ok = rare ? known >= 40 && known >= 30 * count : known >= 50 && known >= 3 * count;
    if (ok && (!best || known > best[1])) best = [candidate, known];
  }
  if (best) corrections[word] = best[0];
}

const sorted = Object.fromEntries(Object.entries(corrections).sort(([a], [b]) => a.localeCompare(b, 'ro')));
writeFileSync(target, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
console.log(`${Object.keys(sorted).length} corecturi scrise în ${target}`);
