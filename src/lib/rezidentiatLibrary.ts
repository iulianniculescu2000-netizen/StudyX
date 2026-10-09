import { isSourceReady, useAIStore } from '../store/aiStore';
import { findOrCreateRezidentiatLibraryRoot } from './rezidentiatRoot';

/**
 * Default AI knowledge-library sources for Rezidențiat — the three reference
 * books already anchored by name in `residencyCurriculum.ts` (Kumar, Lawrence,
 * Sinopsis), so `addKnowledgeSource` auto-detects their real chapter titles
 * via `matchBookByName` the moment they're indexed. `name` must keep matching
 * one of that file's `matchNames` substrings.
 */
export interface RezidentiatLibraryBook {
  id: string;
  name: string;
  label: string;
  description: string;
  load: () => Promise<string>;
}

export const REZIDENTIAT_LIBRARY_BOOKS: RezidentiatLibraryBook[] = [
  {
    id: 'kumar-clark',
    name: 'Kumar și Clark – Medicină Clinică.pdf',
    label: 'Kumar și Clark — Medicină Clinică',
    description: 'Capitolele de rezidențiat, ~2200 de pagini de text',
    load: async () => (await import('../data/rezidentiat/library/kumar.txt?raw')).default,
  },
  {
    id: 'lawrence',
    name: 'Lawrence – Chirurgie generală și specialități chirurgicale.pdf',
    label: 'Lawrence — Chirurgie generală',
    description: 'Chirurgie generală și specialități chirurgicale',
    load: async () => (await import('../data/rezidentiat/library/lawrence.txt?raw')).default,
  },
  {
    id: 'sinopsis',
    name: 'Sinopsis de medicină.pdf',
    label: 'Sinopsis de medicină',
    description: 'Dermatologie, pediatrie, obstetrică-ginecologie și altele',
    load: async () => (await import('../data/rezidentiat/library/sinopsis.txt?raw')).default,
  },
];

export function isLibraryBookImported(book: RezidentiatLibraryBook): boolean {
  // A failed or interrupted import must not count: it would hide the book from "De adăugat" and never be retried.
  return useAIStore.getState().knowledgeSources.some((source) => source.name === book.name && isSourceReady(source) && source.indexStatus !== 'indexing');
}

export async function importRezidentiatLibraryBook(book: RezidentiatLibraryBook): Promise<void> {
  // Drop an earlier attempt that failed, so retrying does not leave an "error" copy behind.
  for (const stale of useAIStore.getState().knowledgeSources.filter((source) => source.name === book.name && source.indexStatus === 'error')) {
    await useAIStore.getState().removeKnowledgeSource(stale.id);
  }
  const text = await book.load();
  const folderId = findOrCreateRezidentiatLibraryRoot();
  const source = await useAIStore.getState().addKnowledgeSource(book.name, text, 'pdf');
  useAIStore.getState().moveSourceToLibraryFolder(source.id, folderId);
}
