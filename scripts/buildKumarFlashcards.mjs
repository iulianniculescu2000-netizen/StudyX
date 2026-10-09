/**
 * Rebuilds src/data/rezidentiat/kumar_flashcards.json from the "Kumar - complement
 * simplu" PDF. Safe to re-run: cards keep the ids they already have (study
 * progress is keyed by them), new cards get deterministic ids.
 *
 *   node scripts/buildKumarFlashcards.mjs                 # default PDF path
 *   node scripts/buildKumarFlashcards.mjs --pdf "D:\x.pdf"
 *   node scripts/buildKumarFlashcards.mjs --dry           # report only, write nothing
 *   REZI_KUMAR_PDF="D:\x.pdf" node scripts/buildKumarFlashcards.mjs
 *
 * Replaces the old ingestFlashcards.js / reparseFlashcards.js, which used random
 * ids (every run orphaned all progress) and mislabelled ~150 cards' chapters.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildFlashcardDeck, parseKumarText, repairSplitWords } from './lib/flashcardClean.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'src', 'data', 'rezidentiat', 'kumar_flashcards.json');
const DEFAULT_PDF = 'C:/Users/Iulia/Desktop/Rezidentiat/Grile/Kumar -  complement simplu.pdf';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dry = process.argv.includes('--dry');
const pdfPath = argValue('--pdf') ?? process.env.REZI_KUMAR_PDF ?? DEFAULT_PDF;

async function extractPdfText(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  let out = '';
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    // hasEOL keeps physical lines: headings and numbered items are recognised by line, not by regex over a blob.
    out += `\n<<PAGE ${pageNumber}>>\n` + content.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(' ');
  }
  return out;
}

if (!fs.existsSync(pdfPath)) {
  console.error(`PDF-ul nu există: ${pdfPath}\nPasează calea cu --pdf "<cale>" sau REZI_KUMAR_PDF.`);
  process.exit(1);
}

/** Word frequencies (diacritic-free, lower-case) from the reference books, used to rejoin words the PDF cut in two. */
function buildLexicon() {
  const dir = path.join(__dirname, '..', 'src', 'data', 'rezidentiat', 'library');
  const counts = new Map();
  if (!fs.existsSync(dir)) return counts;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.txt'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const word of text.match(/[a-z]{2,}/g) ?? []) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

const lexicon = buildLexicon();
const allJoins = [];
const repairText = lexicon.size === 0
  ? undefined
  : (text) => {
      const { text: repaired, joins } = repairSplitWords(text, (word) => lexicon.get(word) ?? 0);
      allJoins.push(...joins);
      return repaired;
    };

const previous = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : undefined;
const parsed = parseKumarText(await extractPdfText(pdfPath), { repairText });
const { deck, stats } = buildFlashcardDeck(parsed, previous);

const perChapter = new Map();
for (const card of deck.questions) perChapter.set(card.category, (perChapter.get(card.category) ?? 0) + 1);
console.log(`Carduri: ${stats.total} (id-uri păstrate: ${stats.reused}, noi: ${stats.created})`);
for (const [chapter, count] of perChapter) console.log(`  ${String(count).padStart(4)}  ${chapter}`);
console.log(`\nCuvinte rupte de PDF, relipite: ${allJoins.length}`);
for (const join of allJoins) console.log(`  ${join}`);
if (previous && stats.created > 0) {
  console.log(`\n⚠ ${stats.created} carduri au id nou. Progresul deja înregistrat pe cardurile vechi nepotrivite rămâne pe vechiul id.`);
}

if (dry) {
  console.log('\n--dry: nu am scris nimic.');
} else {
  fs.writeFileSync(OUTPUT, JSON.stringify(deck, null, 2) + '\n', 'utf8');
  console.log(`\nScris: ${OUTPUT}`);
}
