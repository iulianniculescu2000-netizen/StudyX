/**
 * Textul organizat al cărților incluse în aplicație (Kumar, Lawrence, Sinopsis), pagină cu pagină, extras din exact
 * PDF-urile livrate în installer (scripts/extract-book-pages.mjs). Numerotarea e cea din plan (`topic.pdf`), deci un
 * capitol se citește direct din paginile lui, fără bibliotecă AI și fără reindexare.
 */
import { basePlan } from './curriculum';
import { parsePageRange, type BookCode, type PageRange } from './bookPages';
import type { Topic } from './organizare/types';
import { extractPageMap, pageMarker, rememberPageMap } from '../ai/pageMarkers';

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
  const marked = [
    ...pages.map((text, index) => `${pageMarker(index + 1)}${text.trim()}`),
    ...extra.map(({ printed, text }, index) => `${pageMarker(pages.length + index + 1, printed)}Pagina tipărită ${printed} (nu e în PDF-ul din aplicație)\n${text.trim()}`),
  ].join('\n\n');
  const { text, pages: starts } = extractPageMap(marked);
  const lead = text.length - text.trimStart().length;
  const clean = text.trim();
  rememberPageMap(clean, starts.map((start) => ({ ...start, offset: Math.max(0, start.offset - lead) })));
  return clean;
}
