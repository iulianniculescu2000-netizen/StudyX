/**
 * Cărțile de bază (Kumar, Lawrence, Sinopsis) văzute ca „stare”: sunt incluse în aplicație și trebuie să fie mereu gata, fără
 * ca studentul să le adauge. Interfața citește starea de aici; logica de pregătire (indexare automată) scrie în același store.
 */
import { useMemo } from 'react';
import { isSourceReady, useAIStore, type AIKnowledgeSource } from '../store/aiStore';
import { REZIDENTIAT_LIBRARY_BOOKS, type RezidentiatLibraryBook } from './rezidentiatLibrary';

export type BundledBookState = 'missing' | 'indexing' | 'ready' | 'error';

export interface BundledBookStatus {
  book: RezidentiatLibraryBook;
  state: BundledBookState;
  /** 0-100, doar cât timp se indexează. */
  progress: number;
  /** Sursa din biblioteca AI, dacă există. */
  source?: AIKnowledgeSource;
}

/** Starea fiecărei cărți de bază, după sursele din biblioteca AI (nume identic = aceeași carte). */
export function bundledBookStatuses(sources: ReadonlyArray<AIKnowledgeSource>): BundledBookStatus[] {
  return REZIDENTIAT_LIBRARY_BOOKS.map((book) => {
    const matches = sources.filter((source) => source.name === book.name);
    const ready = matches.find((source) => isSourceReady(source) && source.indexStatus !== 'indexing');
    if (ready) return { book, state: 'ready', progress: 100, source: ready };
    const indexing = matches.find((source) => source.indexStatus === 'indexing');
    if (indexing) return { book, state: 'indexing', progress: indexing.indexProgress ?? 0, source: indexing };
    const failed = matches.find((source) => source.indexStatus === 'error');
    if (failed) return { book, state: 'error', progress: 0, source: failed };
    return { book, state: 'missing', progress: 0 };
  });
}

/** În componente: se actualizează singur când se schimbă biblioteca. */
export function useBundledBookStatuses(): BundledBookStatus[] {
  const knowledgeSources = useAIStore((state) => state.knowledgeSources);
  return useMemo(() => bundledBookStatuses(knowledgeSources), [knowledgeSources]);
}
