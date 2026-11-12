/**
 * Textul organizat al cărților incluse în aplicație (Kumar, Lawrence, Sinopsis), pagină cu pagină, extras din exact
 * PDF-urile livrate în installer (scripts/extract-book-pages.mjs). Numerotarea e cea din plan (`topic.pdf`), deci un
 * capitol se citește direct din paginile lui, fără bibliotecă AI și fără reindexare.
 */
import { basePlan } from './curriculum';
import { parsePageRange, type BookCode, type PageRange } from './bookPages';
import type { Topic } from './organizare/types';
import { rememberPrebuiltChunks } from '../ai/pageMarkers';
import { BUNDLED_BOOK_NAMES } from './bundledBookNames';
import { normalizeSearchText } from '../ai/medicalSynonyms';

const LOADERS: Record<BookCode, () => Promise<{ default: string[] }>> = {
  K: () => import('../data/rezidentiat/library/kumar.pages.json'),
  L: () => import('../data/rezidentiat/library/lawrence.pages.json'),
  S: () => import('../data/rezidentiat/library/sinopsis.pages.json'),
};

const cache = new Map<BookCode, Promise<string[]>>();

/**
 * Pagini care există în folderul proprietarului, dar nu în PDF-ul din aplicație (Lawrence: 69 din 414). Intră doar în căutare și chat,
 * după paginile PDF-ului, cu pagina tipărită în marcaj; numerotarea paginilor din aplicație și cititorul rămân neatinse.
 * Se regenerează cu: node scripts/map-owner-folder.mjs lawrence <folderCarti> "" src/data/rezidentiat/library/lawrence.extra.json
 */
async function extraBookPages(book: BookCode): Promise<Array<{ printed: number; text: string }>> {
  if (book !== 'L') return [];
  const extra = (await import('../data/rezidentiat/library/lawrence.extra.json')).default as Record<string, string>;
  return Object.entries(extra)
    .map(([printed, text]) => ({ printed: Number(printed), text }))
    .filter((entry) => Number.isFinite(entry.printed) && entry.text.trim())
    .sort((a, b) => a.printed - b.printed);
}

export function loadBookPages(book: BookCode): Promise<string[]> {
  let pages = cache.get(book);
  if (!pages) {
    pages = LOADERS[book]().then((m) => m.default);
    cache.set(book, pages);
    pages.catch(() => cache.delete(book));
  }
  return pages;
}

/**
 * Pagina din afara PDF-ului inclus pe care o citează chatul: în indexare, paginile din `extraBookPages` vin după ultima pagină a PDF-ului
 * (pagina N + 1, N + 2…), deci o citare cu `pdfPage` peste N nu are ce deschide în cititorul de PDF. `null` pentru paginile din PDF.
 */
export async function extraPageAt(book: BookCode, pdfPage: number): Promise<{ printed: number; text: string } | null> {
  if (!Number.isFinite(pdfPage)) return null;
  const pages = await loadBookPages(book);
  if (pdfPage <= pages.length) return null;
  const extra = await extraBookPages(book);
  return extra[Math.round(pdfPage) - pages.length - 1] ?? null;
}

/**
 * Pagina (de la 1) din intervalul `from`–`to` care conține fragmentul citat. Un fragment structurat poate începe pe o pagină și
 * continua pe următoarea; „Deschide în carte” trebuie să ajungă la pagina cu textul, nu la prima din interval. Se numără grupurile
 * de câte patru cuvinte consecutive ale fragmentului găsite în fiecare pagină (fără diacritice); la egalitate câștigă pagina
 * mai timpurie, iar fără nicio potrivire rămâne `from`.
 */
export function pageHoldingExcerpt(pages: readonly string[], from: number, to: number, excerpt: string): number {
  const first = Math.max(1, Math.round(from));
  const last = Math.min(pages.length, Math.round(to));
  if (!excerpt || last <= first) return first;
  const words = normalizeSearchText(excerpt).replace(/[^\p{L}\p{N} ]+/gu, ' ').split(' ').filter(Boolean);
  const grams: string[] = [];
  for (let i = 0; i + 4 <= words.length; i++) grams.push(words.slice(i, i + 4).join(' '));
  if (grams.length === 0) return first;
  let best = first;
  let bestScore = 0;
  for (let page = first; page <= last; page++) {
    const folded = normalizeSearchText(pages[page - 1] ?? '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/ +/g, ' ');
    const score = grams.reduce((sum, gram) => sum + (folded.includes(gram) ? 1 : 0), 0);
    if (score > bestScore) { best = page; bestScore = score; }
  }
  return best;
}

/** Marcajul de început de pagină din textul compus; cititorul îl desenează ca separator discret. */
export const PAGE_HEADING = '§ ';

/** Paginile capitolului din care face parte topicul: de la prima la ultima pagină a topicurilor lui. */
export function chapterPageRange(topic: Pick<Topic, 'group' | 'pdf'>): PageRange | null {
  const ranges = basePlan().topics
    .filter((t) => t.group === topic.group)
    .map((t) => parsePageRange(t.pdf))
    .filter((r): r is PageRange => !!r);
  if (!ranges.length) return parsePageRange(topic.pdf);
  return { first: Math.min(...ranges.map((r) => r.first)), last: Math.max(...ranges.map((r) => r.last)) };
}

/** Textul paginilor `range` (inclusiv), fiecare precedată de `§ <număr>`. */
export async function bookText(book: BookCode, range: PageRange): Promise<string> {
  const pages = await loadBookPages(book);
  const out: string[] = [];
  for (let n = Math.max(1, range.first); n <= Math.min(range.last, pages.length); n += 1) {
    const text = pages[n - 1]?.trim();
    if (text) out.push(`${PAGE_HEADING}${n}\n\n${text}`);
  }
  return out.join('\n\n');
}

/** Pentru un cititor deschis la un topic (capitolul întreg) sau la o pagină (pagina și vecinele ei). */
export function bookTextFor(book: BookCode, topic: Pick<Topic, 'group' | 'pdf'> | null | undefined, pdfPage: number): Promise<string> {
  const range = (topic && chapterPageRange(topic)) ?? { first: Math.max(1, pdfPage - 1), last: pdfPage + 1 };
  return bookText(book, range);
}

/**
 * Textul curat al unei cărți incluse, pentru indexarea în biblioteca AI (chat, citări). În locul textului OCR, fragmentele vin din
 * paginile extrase din PDF (diacritice, titluri și liste corecte) și primesc numărul paginii din PDF, la fel ca la un PDF importat:
 * citările din chat arată „p. N” și deschid cartea la pagina potrivită. Harta paginilor e predată indexării prin canalul lateral
 * din `pageMarkers` (legată de text prin amprentă), deci textul întors trebuie folosit exact așa, după `trim()`.
 */
export async function bundledBookText(book: BookCode): Promise<string> {
  const pages = await loadBookPages(book);
  const extra = await extraBookPages(book);
  // Fragmentele vin din baza structurată a cărții: un subiect și o secțiune pe fragment, cu titlurile și pagina exactă.
  const { structureBook, structuredChunks, extraPageChunks } = await import('./bookStructure');
  const name = BUNDLED_BOOK_NAMES[BOOK_KEYS[book]];
  const main = structuredChunks(structureBook(book, pages), name);
  const chunks = [...main, ...extraPageChunks(extra, pages.length, name, main.length)];
  const clean = chunks.map((chunk) => chunk.text).join('\n\n').trim();
  rememberPrebuiltChunks(clean, chunks);
  return clean;
}

const BOOK_KEYS: Record<BookCode, keyof typeof BUNDLED_BOOK_NAMES> = { K: 'kumar', L: 'lawrence', S: 'sinopsis' };
