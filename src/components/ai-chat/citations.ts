import { useMemo } from 'react';
import { cleanSourceName, formatCitationLabel, formatPageRange, type ContextSource } from '../../ai/contextBuilder';
import { bookOfSourceName, type BookCode } from '../../lib/curriculum';
import { useAIStore } from '../../store/aiStore';
import { isBundledLibraryBookName } from '../../lib/rezidentiatLibrary';
import { isRezidentiatSource, rezidentiatFolderIds } from '../../lib/ai/sourceScope';
import type { SourceTier } from '../../lib/bookTier';
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
  tier?: Citation['tier'];
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
    ...(source.tier ? { tier: source.tier } : {}),
  };
}

/** „Kumar, p. 1136 (Hipertensiunea arterială)". */
export function citationLabel(citation: Pick<Citation, 'source' | 'page' | 'pageEnd' | 'printedPage' | 'heading'>): string {
  return formatCitationLabel(citation.source, citation.page, citation.pageEnd, citation.printedPage, citation.heading);
}

export interface CitationChipParts {
  /** Numele cărții sau al documentului, fără extensie. */
  title: string;
  /** „p. 1136” (pagina tipărită, apoi cea din PDF), sau gol când nu se știe. */
  where: string;
  /** Eticheta completă („Kumar, p. 1136 (Hipertensiunea arterială)”), pentru sugestia la trecerea cu mouse-ul. */
  full: string;
}

/**
 * Chip-ul unei surse sub un răspuns arată doar titlul și pagina, pe o singură linie; capitolul (adesea cu MAJUSCULE din
 * carte) rămâne în eticheta completă, la trecerea cu mouse-ul și pentru cititoarele de ecran.
 */
export function citationChipParts(citation: Pick<Citation, 'source' | 'page' | 'pageEnd' | 'printedPage' | 'heading'>): CitationChipParts {
  const range = typeof citation.printedPage === 'number' && citation.printedPage > 0
    ? String(citation.printedPage)
    : formatPageRange(citation.page, citation.pageEnd);
  return { title: cleanSourceName(citation.source), where: range ? `p. ${range}` : '', full: citationLabel(citation) };
}

/** Cere cititorului să deschidă pagina citată. Nu face nimic dacă nu există `window`. */
export function openBookCitation(citation: Pick<Citation, 'source' | 'sourceId' | 'page' | 'printedPage' | 'excerpt' | 'tier'>): void {
  if (typeof window === 'undefined') return;
  const detail: OpenBookDetail = {
    book: bookOfSourceName(citation.source) ?? undefined,
    ...(citation.page !== undefined ? { pdfPage: citation.page } : {}),
    ...(citation.printedPage !== undefined ? { printedPage: citation.printedPage } : {}),
    ...(citation.sourceId ? { sourceId: citation.sourceId } : {}),
    sourceName: citation.source,
    excerpt: citation.excerpt,
    ...(citation.tier ? { tier: citation.tier } : {}),
  };
  window.dispatchEvent(new CustomEvent<OpenBookDetail>(OPEN_BOOK_EVENT, { detail }));
}

/** Cartea de bază se recunoaște după numele fișierului inclus, cu sau fără extensie. */
function isBundledCitationName(name: string): boolean {
  return isBundledLibraryBookName(name) || isBundledLibraryBookName(`${name.trim()}.pdf`);
}

/**
 * Nivelul fiecărei citări: `tier` de pe citare, când există; altfel cartea inclusă (după nume) e `book`, un document din
 * folderul Rezidențiat e `bank`, restul `general`. Un singur calcul pentru toate citările unui mesaj.
 */
export function useCitationTiers(citations: readonly Pick<Citation, 'source' | 'sourceId' | 'tier'>[]): SourceTier[] {
  const sources = useAIStore((state) => state.knowledgeSources);
  const folders = useAIStore((state) => state.libraryFolders);
  return useMemo(() => {
    const rez = rezidentiatFolderIds(folders);
    return citations.map((citation) => {
      if (citation.tier) return citation.tier;
      if (isBundledCitationName(citation.source)) return 'book';
      const source = (citation.sourceId ? sources.find((item) => item.id === citation.sourceId) : undefined)
        ?? sources.find((item) => item.name === citation.source);
      return source && isRezidentiatSource(source, rez) ? 'bank' : 'general';
    });
  }, [citations, sources, folders]);
}

/** Eticheta scurtă a nivelului în chip: „Carte” pentru cărțile de bază, „Material” pentru banca de materiale. */
export const CITATION_TIER_TAG: Record<SourceTier, string> = { book: 'Carte', bank: 'Material', general: '' };

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
