import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./idb', () => ({
  idbGet: async () => undefined,
  idbSet: async () => undefined,
  idbRemove: async () => undefined,
}));

import { useAIStore, type AIKnowledgeSource } from '../store/aiStore';
import { isFolderDeletionBlocked, isProtectedFolder, isProtectedSource } from './bookProtection';
import { REZIDENTIAT_LIBRARY_BOOKS } from './rezidentiatLibrary';
import { BUNDLED_BOOK_NAMES } from './bundledBookNames';

const BOOK = REZIDENTIAT_LIBRARY_BOOKS[0].name;

function source(id: string, name: string, extra: Partial<AIKnowledgeSource> = {}): AIKnowledgeSource {
  return { id, name, type: 'pdf', preview: '', charCount: 10, wordCount: 2, chunkCount: 1, qualityScore: 80, addedAt: 1, indexStatus: 'ready', indexProgress: 100, folderId: 'rez', ...extra };
}

beforeEach(() => {
  useAIStore.setState({
    libraryFolders: [
      { id: 'rez', name: 'Rezidențiat', emoji: '🩺', parentId: null, createdAt: 1 },
      { id: 'rez-sub', name: 'Capitole', emoji: '📚', parentId: 'rez', createdAt: 2 },
      { id: 'gen', name: 'Facultate', emoji: '🎓', parentId: null, createdAt: 3 },
    ],
    knowledgeSources: [source('book', BOOK), source('note', 'Note.pdf', { folderId: 'rez-sub' }), source('broken', BUNDLED_BOOK_NAMES.sinopsis, { indexStatus: 'error' })],
  });
});

describe('protecția cărților de bază', () => {
  it('isProtectedSource: cărțile incluse da, materialele și copiile eșuate nu', () => {
    expect(isProtectedSource({ name: BOOK, indexStatus: 'ready' })).toBe(true);
    expect(isProtectedSource({ name: BOOK })).toBe(true);
    expect(isProtectedSource({ name: 'Note.pdf', indexStatus: 'ready' })).toBe(false);
    expect(isProtectedSource({ name: BUNDLED_BOOK_NAMES.sinopsis, indexStatus: 'error' })).toBe(false);
  });

  it('nu se șterge o carte de bază, dar se șterge un material și o copie eșuată', async () => {
    await useAIStore.getState().removeKnowledgeSource('book');
    expect(useAIStore.getState().knowledgeSources.some((s) => s.id === 'book')).toBe(true);
    await useAIStore.getState().removeKnowledgeSource('note');
    await useAIStore.getState().removeKnowledgeSource('broken');
    expect(useAIStore.getState().knowledgeSources.map((s) => s.id)).toEqual(['book']);
  });

  it('nu se mută o carte din Rezidențiat; un material se mută liber', () => {
    useAIStore.getState().moveSourceToLibraryFolder('book', 'gen');
    useAIStore.getState().moveSourceToLibraryFolder('book', null);
    useAIStore.getState().moveSourceToLibraryFolder('book', 'rez-sub');
    expect(useAIStore.getState().knowledgeSources.find((s) => s.id === 'book')?.folderId).toBe('rez');
    useAIStore.getState().moveSourceToLibraryFolder('note', 'gen');
    expect(useAIStore.getState().knowledgeSources.find((s) => s.id === 'note')?.folderId).toBe('gen');
  });

  it('o carte rătăcită în afara Rezidențiatului poate fi readusă în rădăcina lui', () => {
    useAIStore.setState((state) => ({ knowledgeSources: state.knowledgeSources.map((s) => (s.id === 'book' ? { ...s, folderId: null } : s)) }));
    useAIStore.getState().moveSourceToLibraryFolder('book', 'rez');
    expect(useAIStore.getState().knowledgeSources.find((s) => s.id === 'book')?.folderId).toBe('rez');
  });

  it('folderul Rezidențiat nu se șterge și nu se redenumește', () => {
    expect(isProtectedFolder({ id: 'rez', name: 'Rezidențiat', parentId: null })).toBe(true);
    useAIStore.getState().deleteLibraryFolder('rez');
    useAIStore.getState().renameLibraryFolder('rez', 'Altceva');
    const folders = useAIStore.getState().libraryFolders;
    expect(folders.find((f) => f.id === 'rez')?.name).toBe('Rezidențiat');
    expect(useAIStore.getState().knowledgeSources.find((s) => s.id === 'book')?.folderId).toBe('rez');
  });

  it('un subfolder fără cărți se șterge, unul care ține o carte nu', () => {
    useAIStore.getState().deleteLibraryFolder('rez-sub');
    expect(useAIStore.getState().libraryFolders.some((f) => f.id === 'rez-sub')).toBe(false);
    useAIStore.setState((state) => ({ knowledgeSources: state.knowledgeSources.map((s) => (s.id === 'book' ? { ...s, folderId: 'gen' } : s)) }));
    expect(isFolderDeletionBlocked('gen', useAIStore.getState().libraryFolders, useAIStore.getState().knowledgeSources)).toBe(true);
    useAIStore.getState().deleteLibraryFolder('gen');
    expect(useAIStore.getState().libraryFolders.some((f) => f.id === 'gen')).toBe(true);
  });

  it('numele din modulul fără dependențe coincid cu cărțile din bibliotecă', () => {
    expect(REZIDENTIAT_LIBRARY_BOOKS.map((b) => b.name).sort()).toEqual(Object.values(BUNDLED_BOOK_NAMES).sort());
  });
});
