/**
 * Căutare locală în textul cărților incluse (Kumar, Lawrence, Sinopsis) pentru paleta Ctrl+K. Fără AI și fără rețea:
 * paginile vin din `loadBookPages` (același text ca în cititor), se normalizează o singură dată (fără diacritice, aceeași
 * lungime ca originalul, ca pozițiile fragmentelor să se potrivească), iar o interogare parcurge doar ~880 de pagini.
 */
import { foldSameLength, type Segment } from '../../lib/contentSearch';
import type { BookCode } from '../../lib/bookPages';

export interface BookIndex {
  book: BookCode;
  raw: readonly string[];
  folded: readonly string[];
}

export interface BookHit {
  book: BookCode;
  /** Numărul paginii din PDF-ul cărții (începe de la 1), cel pe care îl deschide cititorul. */
  pdfPage: number;
  score: number;
  snippet: Segment[];
}

/** Interogarea minimă pentru cărți: sub trei litere ar întoarce aproape toate paginile. */
export const BOOK_MIN_QUERY = 3;
const SNIPPET_RADIUS = 70;

export function buildBookIndex(book: BookCode, pages: readonly string[]): BookIndex {
  return { book, raw: pages, folded: pages.map((page) => foldSameLength(page ?? '')) };
}

/** Cuvintele interogării, normalizate; cuvintele de o literă se ignoră. */
export function queryTokens(query: string): string[] {
  const seen = new Set<string>();
  for (const word of foldSameLength(query).split(/[^\p{L}\p{N}]+/u)) {
    if (word.length >= 2) seen.add(word);
  }
  return [...seen];
}

function countOccurrences(haystack: string, needle: string, cap: number): number {
  let count = 0;
  let from = 0;
  while (count < cap) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

/** Marchează toate aparițiile cuvintelor în fragment (intervalele care se ating se unesc). */
export function highlightTokens(raw: string, folded: string, tokens: readonly string[]): Segment[] {
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      ranges.push([at, at + token.length]);
      from = at + token.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  const out: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) out.push({ text: raw.slice(cursor, start), hit: false });
    out.push({ text: raw.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < raw.length) out.push({ text: raw.slice(cursor), hit: false });
  return out;
}

function makeSnippet(raw: string, folded: string, at: number, tokens: readonly string[]): Segment[] {
  let start = Math.max(0, at - SNIPPET_RADIUS);
  let end = Math.min(raw.length, at + SNIPPET_RADIUS);
  // Fragmentul începe și se termină la limite de cuvânt.
  if (start > 0) {
    const space = raw.indexOf(' ', start);
    if (space >= 0 && space < at) start = space + 1;
  }
  if (end < raw.length) {
    const space = raw.lastIndexOf(' ', end);
    if (space > at) end = space;
  }
  const squash = (text: string) => text.replace(/\s+/g, ' ');
  // Același decupaj pe ambele texte, deci pozițiile rămân aliniate și după comprimarea spațiilor.
  const segments = highlightTokens(squash(raw.slice(start, end)), squash(folded.slice(start, end)), tokens);
  if (start > 0 && segments.length) segments[0] = { ...segments[0], text: `…${segments[0].text.trimStart()}` };
  if (end < raw.length && segments.length) {
    const last = segments[segments.length - 1];
    segments[segments.length - 1] = { ...last, text: `${last.text.trimEnd()}…` };
  }
  return segments;
}

/**
 * Paginile care conțin toate cuvintele interogării. Scor: fraza întreagă (cu 50 de puncte), apoi frecvența fiecărui
 * cuvânt (plafonată) și un bonus când cuvintele apar în începutul paginii (titlul).
 */
export function searchBook(index: BookIndex, query: string, limit = 3): BookHit[] {
  const trimmed = query.trim();
  if (trimmed.length < BOOK_MIN_QUERY) return [];
  const tokens = queryTokens(trimmed);
  if (tokens.length === 0) return [];
  const phrase = tokens.length > 1 ? foldSameLength(trimmed).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 1).join(' ') : '';
  const found: Array<{ page: number; score: number; at: number }> = [];
  for (let i = 0; i < index.folded.length; i += 1) {
    const folded = index.folded[i];
    if (!folded) continue;
    let score = 0;
    let firstAt = -1;
    let ok = true;
    for (const token of tokens) {
      const at = folded.indexOf(token);
      if (at < 0) { ok = false; break; }
      if (firstAt < 0 || at < firstAt) firstAt = at;
      score += countOccurrences(folded, token, 4) * 3;
      if (at < 160) score += 5;
    }
    if (!ok) continue;
    if (phrase && folded.replace(/[^\p{L}\p{N}]+/gu, ' ').includes(phrase)) score += 50;
    found.push({ page: i + 1, score, at: firstAt });
  }
  found.sort((a, b) => b.score - a.score || a.page - b.page);
  return found.slice(0, limit).map(({ page, score, at }) => ({
    book: index.book,
    pdfPage: page,
    score,
    snippet: makeSnippet(index.raw[page - 1] ?? '', index.folded[page - 1] ?? '', at, tokens),
  }));
}
