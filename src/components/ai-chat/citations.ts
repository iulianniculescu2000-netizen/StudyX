import { formatCitationLabel, type ContextSource } from '../../ai/contextBuilder';
import { bookOfSourceName, type BookCode } from '../../lib/curriculum';
import type { Citation } from './shared';

/** Evenimentul pe care îl ascultă cititorul de cărți. */
export const OPEN_BOOK_EVENT = 'studyx:open-book';

export interface OpenBookDetail {
  book: BookCode | undefined;
  pdfPage?: number;
  printedPage?: number;
  sourceId?: string;
  sourceName?: string;
  excerpt?: string;
}

/** Citarea din UI pornind de la o sursă din contextul numerotat. */
export function citationFromSource(source: ContextSource, fallbackTopic = ''): Citation {
  return {
    n: source.n,
    source: source.source,
    topic: source.heading ?? source.chapter ?? fallbackTopic,
    score: source.score ?? 0,
    excerpt: source.excerpt,
    ...(source.sourceId ? { sourceId: source.sourceId } : {}),
    ...(source.page !== undefined ? { page: source.page } : {}),
    ...(source.pageEnd !== undefined ? { pageEnd: source.pageEnd } : {}),
    ...(source.printedPage !== undefined ? { printedPage: source.printedPage } : {}),
    ...(source.heading ? { heading: source.heading } : {}),
  };
}

/** „Kumar, p. 1136 (Hipertensiunea arterială)". */
export function citationLabel(citation: Pick<Citation, 'source' | 'page' | 'pageEnd' | 'printedPage' | 'heading'>): string {
  return formatCitationLabel(citation.source, citation.page, citation.pageEnd, citation.printedPage, citation.heading);
}

/** Cere cititorului să deschidă pagina citată. Nu face nimic dacă nu există `window`. */
export function openBookCitation(citation: Pick<Citation, 'source' | 'sourceId' | 'page' | 'printedPage' | 'excerpt'>): void {
  if (typeof window === 'undefined') return;
  const detail: OpenBookDetail = {
    book: bookOfSourceName(citation.source) ?? undefined,
    ...(citation.page !== undefined ? { pdfPage: citation.page } : {}),
    ...(citation.printedPage !== undefined ? { printedPage: citation.printedPage } : {}),
    ...(citation.sourceId ? { sourceId: citation.sourceId } : {}),
    sourceName: citation.source,
    excerpt: citation.excerpt,
  };
  window.dispatchEvent(new CustomEvent<OpenBookDetail>(OPEN_BOOK_EVENT, { detail }));
}

/** Eticheta de accesibilitate (română) a chip-ului. */
export function citationAriaLabel(citation: Citation): string {
  const where = citation.printedPage !== undefined
    ? `pagina ${citation.printedPage}`
    : citation.page !== undefined ? `pagina PDF ${citation.page}` : '';
  const destination = bookOfSourceName(citation.source) ? 'în carte' : 'în textul indexat';
  return `Deschide sursa ${citation.n ?? ''} ${destination}: ${cleanName(citation.source)}${where ? `, ${where}` : ''}${citation.heading ? `, ${citation.heading}` : ''}`.replace(/\s+/g, ' ');
}

export function citationOpenLabel(citation: Pick<Citation, 'source'>): string {
  return bookOfSourceName(citation.source) ? 'Deschide în carte' : 'Deschide sursa';
}

function cleanName(name: string) {
  return name.replace(/\.(pdf|docx?|txt|md)$/i, '');
}
