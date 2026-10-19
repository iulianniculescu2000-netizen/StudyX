/**
 * Rezidențiat and the rest of the app keep separate libraries: a book filed under the „Rezidențiat” folder of the
 * AI library is only ever offered by the Rezidențiat chat (and its Studio), and never by the general chat, the
 * general flashcard hub or the dashboard. Everything that lists or searches sources goes through here.
 */
import { useMemo } from 'react';
import { useAIStore, type AIKnowledgeSource, type AILibraryFolder } from '../../store/aiStore';
import { isUnderRezidentiatRoot } from '../rezidentiatRoot';
import { isBundledBookFileName } from '../bundledBookNames';

export type SourceScope = 'general' | 'rezidentiat';

type ScopedSource = Pick<AIKnowledgeSource, 'id' | 'folderId'>;

/** Ids of the library folders that are the Rezidențiat root or sit under it. */
export function rezidentiatFolderIds(folders: ReadonlyArray<AILibraryFolder>): Set<string> {
  const list = [...folders];
  return new Set(list.filter((folder) => isUnderRezidentiatRoot(folder.id, list)).map((folder) => folder.id));
}

export function isRezidentiatSource(source: Pick<AIKnowledgeSource, 'folderId'>, rezFolders: ReadonlySet<string>): boolean {
  return !!source.folderId && rezFolders.has(source.folderId);
}

/** The sources a scope may use: Rezidențiat books only, or everything except them. */
export function filterSourcesByScope<T extends ScopedSource>(sources: ReadonlyArray<T>, folders: ReadonlyArray<AILibraryFolder>, scope: SourceScope): T[] {
  const rez = rezidentiatFolderIds(folders);
  return sources.filter((source) => isRezidentiatSource(source, rez) === (scope === 'rezidentiat'));
}

/**
 * Retriever filters that keep a search inside one scope. `null` means the scope has no sources at all: search nothing.
 * `includeBaseBooks` (chatul general): cele trei cărți de bază incluse în aplicație intră și în căutarea generală, ca o
 * întrebare medicală de oriunde să primească pasajul cu pagina (decizia proprietarului, 19 oct 2026); materialele proprii
 * din Rezidențiat rămân doar acolo.
 */
export function retrievalFiltersForScope(
  sources: ReadonlyArray<ScopedSource & { name?: string }>,
  folders: ReadonlyArray<AILibraryFolder>,
  scope: SourceScope,
  options: { includeBaseBooks?: boolean } = {},
): { sourceIds?: string[]; excludeSourceIds?: string[]; rezidentiat?: boolean } | null {
  const rez = rezidentiatFolderIds(folders);
  if (scope === 'rezidentiat') {
    const ids = sources.filter((source) => isRezidentiatSource(source, rez)).map((source) => source.id);
    // `rezidentiat`: cărțile de bază au întâietate la clasare și în context (vezi retriever.ts).
    return ids.length > 0 ? { sourceIds: ids, rezidentiat: true } : null;
  }
  const keepBook = (source: { name?: string }) => !!options.includeBaseBooks && isBundledBookFileName(source.name ?? '');
  const excluded = sources.filter((source) => isRezidentiatSource(source, rez) && !keepBook(source)).map((source) => source.id);
  return excluded.length > 0 ? { excludeSourceIds: excluded } : {};
}

/** Ready sources of a scope, read straight from the store (for code that is not a component). */
export function scopedReadySources(scope: SourceScope): AIKnowledgeSource[] {
  const { knowledgeSources, libraryFolders } = useAIStore.getState();
  return filterSourcesByScope(knowledgeSources.filter((source) => source.indexStatus === 'ready'), libraryFolders, scope);
}

/** All sources of a scope, kept up to date in components. */
export function useScopedSources(scope: SourceScope): AIKnowledgeSource[] {
  const knowledgeSources = useAIStore((state) => state.knowledgeSources);
  const libraryFolders = useAIStore((state) => state.libraryFolders);
  return useMemo(() => filterSourcesByScope(knowledgeSources, libraryFolders, scope), [knowledgeSources, libraryFolders, scope]);
}
