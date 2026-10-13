// Extrage textul cărților incluse în aplicație, pagină cu pagină, din exact PDF-urile livrate în build/books
// (aceleași fișiere și aceeași numerotare ca planul din Organizare, vezi src/lib/bookPages.ts › BOOK_FILES).
// Rulare: node scripts/extract-book-pages.mjs [K|L|S] [primaPagină ultimaPagină]  (fără argumente: toate cărțile)
// Ieșire: src/data/rezidentiat/library/<carte>.pages.json = ["text pagina 1", "text pagina 2", ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfjs = await import(pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);

const BOOKS = {
  K: { out: 'kumar', file: 'Carti/Kumar/Kumar 10th ed RO - doar capitolele rezi (391 p).pdf' },
  L: { out: 'lawrence', file: 'Carti/Lawrence/Lawrence RO - capitole rezi (345 p).pdf' },
  S: { out: 'sinopsis', file: 'Carti/Sinopsis/Sinopsis RO - tematica (118 p).pdf' },
};

/** Rândurile unui set de fragmente, grupate pe y (pdf.js dă fragmente cu coordonate, nu rânduri). */
function rowsOf(items) {
  const rows = [];
  for (const it of items) {
    const y = Math.round(it.transform[5]);
    let row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x: it.transform[4], s: it.str, w: it.width });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let end = null;
    for (const p of r.parts) {
      if (end !== null && p.x - end > 1.5 && !line.endsWith(' ') && !p.s.startsWith(' ')) line += ' ';
      line += p.s;
      end = p.x + p.w;
    }
    return line.replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
}

/**
 * Textul unei pagini în ordinea de citire. Cărțile sunt pe două coloane: dacă destule fragmente încep în jumătatea
 * dreaptă, se citește coloana stângă, apoi cea dreaptă (fragmentele care trec peste mijloc rămân în stânga).
 */
function pageText(items, width) {
  const text = items.filter((it) => 'str' in it && it.str && it.str.trim());
  const mid = width / 2;
  const right = text.filter((it) => it.transform[4] >= mid - 4);
  if (right.length < text.length * 0.2) return rowsOf(text).join('\n');
  const left = text.filter((it) => it.transform[4] < mid - 4);
  return [...rowsOf(left), ...rowsOf(right)].join('\n');
}

const SEDILLA = { 'ş': 'ș', 'ţ': 'ț', 'Ş': 'Ș', 'Ţ': 'Ț' };
const fixDiacritics = (t) => t.replace(/[şţŞŢ]/g, (c) => SEDILLA[c]);
const LETTERS = 'a-zA-ZăâîșțĂÂÎȘȚéèüöáó';
const WORD_RE = new RegExp(`[${LETTERS}]+`, 'g');
/** Rânduri care nu sunt din textul cărții: watermark-ul scanării și antetul/subsolul cu număr de pagină. */
const NOISE = [/MG Rezidentiat/i, /Grile Rezi\s*$/i];
// Antet de pagină: „Tulburările concentrației potasiului 189” sau „190 Echilibrul…” (titlu cu majusculă + număr de pagină).
const RUNNING_HEAD = new RegExp(String.raw`^(?:\d{2,4}\s+[A-ZĂÂÎȘȚ][${LETTERS}].{2,70}|[A-ZĂÂÎȘȚ][${LETTERS}]+\s.{1,70}[${LETTERS}]\s+\d{2,4})$`);

/** Frecvența cuvintelor din toată cartea: decide dacă două bucăți de la capăt de rând sunt un singur cuvânt. */
function vocabulary(pages) {
  const freq = new Map();
  for (const page of pages) for (const w of fixDiacritics(page).toLowerCase().match(WORD_RE) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
}

/**
 * Textul brut al unei pagini → text organizat: paragrafe refăcute, cuvinte despărțite lipite la loc, titluri cu „## ”,
 * liste cu „- ”, fără watermark și antet. Rândurile scurte (celule de tabel, „Cadranul”) rămân pe rândul lor.
 */
function organize(raw, freq) {
  const lines = fixDiacritics(raw).split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => !NOISE.some((re) => re.test(l)) && !(RUNNING_HEAD.test(l) && Number((l.match(/\d+/g) ?? ['0']).at(-1)) >= 20 && !/[.;:,]$/.test(l)));
  const blocks = [];
  let para = '';
  const flush = () => { if (para) blocks.push(para); para = ''; };
  const FULL = 48;
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    const next = lines[i + 1] ?? '';
    if (/^[•●▪■◦·]\s*/.test(line)) { flush(); line = `- ${line.replace(/^[•●▪■◦·]\s*/, '')}`; }
    // Variante de grilă („A. Pertussis”): elemente de listă, nu titluri.
    if (/^[A-E][.)]\s/.test(line)) { flush(); blocks.push(`- ${line}`); continue; }
    if (!para) {
      const heading = line.length <= 60 && !/[.,;:!?)\-–]$/.test(line) && /^[A-ZĂÂÎȘȚ]/.test(line) && !line.startsWith('- ')
        && (next === '' || /^[A-ZĂÂÎȘȚ•]/.test(next)) && line.split(' ').length <= 9
        && !/\s(în|de|și|a|la|cu|pe|din|pentru|al|ale|ai|o|un|sau|că|care|mai|este|sunt)$/i.test(line);
      if (heading && !/^(Cadranul|Tabelul|Fig)/.test(line)) { blocks.push(`## ${line}`); continue; }
      para = line;
    } else {
      const prevWord = (para.match(new RegExp(`([${LETTERS}]+)$`)) ?? [])[1];
      const nextWord = (line.match(new RegExp(`^([${LETTERS}]+)`)) ?? [])[1];
      if (prevWord && nextWord && /^[a-zăâîșț]/.test(nextWord)) {
        const joined = (prevWord + nextWord).toLowerCase();
        // Lipit doar dacă forma întreagă apare în carte și măcar o bucată e mai rară ca ea („acțiu”+„nea”), nu „în”+„orice”.
        const whole = freq.get(joined) ?? 0;
        const piece = Math.min(freq.get(prevWord.toLowerCase()) ?? 0, freq.get(nextWord.toLowerCase()) ?? 0);
        const glued = whole > 0 && piece <= whole * 3;
        para += glued ? line : ` ${line}`;
      } else {
        para += ` ${line}`;
      }
    }
    // Rând scurt sau încheiat cu punct: paragraful se termină aici.
    if (line.length < FULL || (/[.!?:]$/.test(line) && /^[A-ZĂÂÎȘȚ•\-]/.test(next))) flush();
  }
  flush();
  return blocks.join('\n\n');
}

async function extract(code, from, to) {
  const book = BOOKS[code];
  const data = new Uint8Array(fs.readFileSync(path.join(root, 'build/books', book.file)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const last = Math.min(to ?? doc.numPages, doc.numPages);
  const pages = [];
  for (let n = from ?? 1; n <= last; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(pageText(content.items, page.getViewport({ scale: 1 }).width));
    page.cleanup();
  }
  return { pages, numPages: doc.numPages };
}

const [code, a, b] = process.argv.slice(2);
if (code && a) {
  const { pages: all } = await extract(code);
  const freq = vocabulary(all);
  for (let n = Number(a); n <= Number(b ?? a); n += 1) console.log(`===== pagina ${n} =====\n${organize(all[n - 1], freq)}\n`);
} else {
  for (const c of code ? [code] : Object.keys(BOOKS)) {
    const { pages: raw, numPages } = await extract(c);
    const freq = vocabulary(raw);
    const pages = raw.map((page) => organize(page, freq));
    const out = path.join(root, 'src/data/rezidentiat/library', `${BOOKS[c].out}.pages.json`);
    fs.writeFileSync(out, JSON.stringify(pages));
    console.log(`${c}: ${numPages} pagini -> ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
  }
}
