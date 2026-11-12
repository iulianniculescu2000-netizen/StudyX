/**
 * Pages written by the model at the end of a schema step (`(p. 350)`) are checked against the sources it was given:
 * only a page that falls inside a cited fragment is drawn as a link; any other page is probably invented and is not
 * drawn at all. Opening goes through the same `openBookCitation` the chat's source chips use.
 */
import type { PageStatus } from './diagram';
import { openBookCitation } from './citations';
import type { Citation } from './shared';

type PageCitation = Pick<Citation, 'source' | 'sourceId' | 'page' | 'pageEnd' | 'printedPage' | 'tier'> & Partial<Pick<Citation, 'excerpt'>>;

/** "350" -> [350, 350]; "350–351" -> [350, 351]; anything else -> null. */
export function parsePageSpec(spec: string): [number, number] | null {
  const match = /^(\d{1,5})(?:\s*[-–—]\s*(\d{1,5}))?$/.exec(spec.trim());
  if (!match) return null;
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  return from >= 1 && to >= from ? [from, to] : null;
}

/**
 * The page numbers the model saw for a fragment: the printed page when the book has one (extended by the PDF span of
 * the fragment), else the PDF page range. Same rule as the "p. N" in the context header and in the chips.
 */
export function shownPageRange(citation: Pick<Citation, 'page' | 'pageEnd' | 'printedPage'>): [number, number] | null {
  const span = citation.page !== undefined && citation.pageEnd !== undefined && citation.pageEnd > citation.page ? citation.pageEnd - citation.page : 0;
  if (typeof citation.printedPage === 'number' && citation.printedPage > 0) return [citation.printedPage, citation.printedPage + span];
  if (typeof citation.page === 'number') return [citation.page, citation.pageEnd !== undefined && citation.pageEnd > citation.page ? citation.pageEnd : citation.page];
  return null;
}

/** The citation whose pages contain the whole of `spec`, narrowed to exactly that page (so the reader opens it, not the fragment start). */
export function citationForPage(citations: readonly PageCitation[], spec: string): PageCitation | undefined {
  const wanted = parsePageSpec(spec);
  if (!wanted) return undefined;
  for (const citation of citations) {
    const shown = shownPageRange(citation);
    if (!shown || wanted[0] < shown[0] || wanted[1] > shown[1]) continue;
    const offset = wanted[0] - shown[0];
    const { pageEnd: _end, ...rest } = citation;
    void _end;
    return {
      ...rest,
      ...(citation.page !== undefined ? { page: citation.page + offset } : {}),
      ...(typeof citation.printedPage === 'number' && citation.printedPage > 0 ? { printedPage: wanted[0] } : {}),
    };
  }
  return undefined;
}

/** Checker for `renderDiagramBlock`: keeps a page only when some cited fragment contains it. */
export function pageStatusFor(citations: readonly PageCitation[]): (spec: string) => PageStatus {
  return (spec) => (citationForPage(citations, spec) ? 'ok' : 'hide');
}

/** Opens the book at a schema page; returns false when no cited fragment contains it. */
export function openSchemaPage(citations: readonly PageCitation[], spec: string): boolean {
  const citation = citationForPage(citations, spec);
  if (!citation) return false;
  openBookCitation({ ...citation, excerpt: citation.excerpt ?? '' });
  return true;
}
