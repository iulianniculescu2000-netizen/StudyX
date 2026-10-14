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
    load: async () => (await import('./bookText')).bundledBookText('K'),
  },
  {
    id: 'lawrence',
    name: 'Lawrence – Chirurgie generală și specialități chirurgicale.pdf',
    label: 'Lawrence — Chirurgie generală',
    description: 'Chirurgie generală și specialități chirurgicale',
    load: async () => (await import('./bookText')).bundledBookText('L'),
  },
  {
    id: 'sinopsis',
    name: 'Sinopsis de medicină.pdf',
    label: 'Sinopsis de medicină',
    description: 'Dermatologie, pediatrie, obstetrică-ginecologie și altele',
    load: async () => (await import('./bookText')).bundledBookText('S'),
  },
];

/**
 * Cărțile incluse în aplicație sunt text simplu, fără PDF și fără numere de pagină: nu au ce reindexa
 * cu pagini, deci nu apar în bannerul „cărți fără pagini”.
 */
export function isBundledLibraryBookName(name: string): boolean {
  return REZIDENTIAT_LIBRARY_BOOKS.some((book) => book.name === name);
}

export function isLibraryBookImported(book: RezidentiatLibraryBook): boolean {
  // A failed or interrupted import must not count: it would hide the book from "De adăugat" and never be retried.
  return useAIStore.getState().knowledgeSources.some((source) => source.name === book.name && isSourceReady(source) && source.indexStatus !== 'indexing');
}

/**
 * Cărțile incluse deja importate al căror index nu vine din textul curat de acum (de ex. importate când se folosea textul OCR):
 * lungimea textului indexat diferă de cea a textului curat. Întoarce sursa împreună cu cartea ei.
 */
export async function findOutdatedBundledBooks(
  sources: Array<{ id: string; name: string; charCount: number; indexStatus?: 'indexing' | 'ready' | 'error' }>,
): Promise<Array<{ sourceId: string; book: RezidentiatLibraryBook }>> {
  const out: Array<{ sourceId: string; book: RezidentiatLibraryBook }> = [];
  for (const book of REZIDENTIAT_LIBRARY_BOOKS) {
    const source = sources.find((item) => item.name === book.name && isSourceReady(item) && item.indexStatus !== 'indexing');
    if (!source) continue;
    if ((await book.load()).length !== source.charCount) out.push({ sourceId: source.id, book });
  }
  return out;
}

/** Reindexează o carte inclusă din textul curat; vechiul index rămâne activ până se termină (ca la `reindexKnowledgeSource`). */
export async function reindexRezidentiatLibraryBook(sourceId: string, book: RezidentiatLibraryBook): Promise<void> {
  await useAIStore.getState().reindexKnowledgeSource(sourceId, await book.load());
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
