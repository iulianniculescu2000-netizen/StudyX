import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useAIStore, type AIKnowledgeSource } from '../../store/aiStore';
import { CAPITOLE_SYNC_EVENT } from '../../lib/capitoleSyncEvent';

const mocks = vi.hoisted(() => ({
  ensureMaterialsRoot: vi.fn(),
  reindexFromRoot: vi.fn(),
  canRead: { value: true },
}));

vi.mock('../../lib/organizareRoot', () => ({ ensureMaterialsRoot: mocks.ensureMaterialsRoot }));
vi.mock('../pdf/bridge', () => ({ canReadBookPdf: () => mocks.canRead.value, bridge: () => undefined }));
vi.mock('./CapitoleSyncCard', () => ({ default: () => null }));
vi.mock('../../hooks/useReindexSources', () => ({
  useReindexSources: () => ({
    state: null,
    openPicker: vi.fn(),
    canReindexFromRoot: () => true,
    reindexFromRoot: mocks.reindexFromRoot,
    renameCheck: null,
    answerRename: vi.fn(),
    cancel: vi.fn(),
    inputProps: { type: 'file', className: 'hidden' },
  }),
}));

import BookLibraryTools from './BookLibraryTools';

const book = (id: string, name: string): AIKnowledgeSource => ({
  id, name, type: 'pdf', preview: '', charCount: 1, wordCount: 1, chunkCount: 100, qualityScore: 1, addedAt: 1, indexStatus: 'ready', folderId: 'rez',
}) as unknown as AIKnowledgeSource;

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const mount = () => render(<ThemeProvider><BookLibraryTools /></ThemeProvider>);

beforeEach(() => {
  mocks.canRead.value = true;
  mocks.ensureMaterialsRoot.mockReset();
  mocks.reindexFromRoot.mockReset().mockResolvedValue([]);
  useAIStore.setState({
    libraryFolders: [{ id: 'rez', name: 'Rezidențiat', emoji: '📚', parentId: null } as never],
    knowledgeSources: [book('s1', 'Kumar și Clark – Medicină Clinică')],
    findSourcesWithoutPages: async () => ['s1'],
    removeKnowledgeSource: vi.fn(async () => undefined),
  });
});

afterEach(() => vi.restoreAllMocks());

describe('„Sincronizează materialele”: un singur buton', () => {
  it('găsește folderul, reindexează cărțile fără pagini și pornește sincronizarea Capitolelor', async () => {
    mocks.ensureMaterialsRoot.mockResolvedValue('C:/Desktop/Rezidentiat');
    const onCapitole = vi.fn();
    window.addEventListener(CAPITOLE_SYNC_EVENT, onCapitole);
    mount();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Sincronizează materialele/ }));
    await flush();
    expect(mocks.ensureMaterialsRoot).toHaveBeenCalledWith('default', { pickIfMissing: true });
    expect(mocks.reindexFromRoot).toHaveBeenCalledTimes(1);
    expect(mocks.reindexFromRoot.mock.calls[0][1]).toBe('C:/Desktop/Rezidentiat');
    expect(mocks.reindexFromRoot.mock.calls[0][0].map((s: AIKnowledgeSource) => s.id)).toEqual(['s1']);
    expect(onCapitole).toHaveBeenCalledTimes(1);
    window.removeEventListener(CAPITOLE_SYNC_EVENT, onCapitole);
  });

  it('fără folder cu materiale nu reindexează și nu pornește Capitolele', async () => {
    mocks.ensureMaterialsRoot.mockResolvedValue(null);
    const onCapitole = vi.fn();
    window.addEventListener(CAPITOLE_SYNC_EVENT, onCapitole);
    mount();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Sincronizează materialele/ }));
    await flush();
    expect(mocks.reindexFromRoot).not.toHaveBeenCalled();
    expect(onCapitole).not.toHaveBeenCalled();
    window.removeEventListener(CAPITOLE_SYNC_EVENT, onCapitole);
  });

  it('când toate cărțile au deja pagini, doar pornește Capitolele', async () => {
    mocks.ensureMaterialsRoot.mockResolvedValue('C:/Desktop/Rezidentiat');
    useAIStore.setState({ findSourcesWithoutPages: async () => [] });
    const onCapitole = vi.fn();
    window.addEventListener(CAPITOLE_SYNC_EVENT, onCapitole);
    mount();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Sincronizează materialele/ }));
    await flush();
    expect(mocks.reindexFromRoot).not.toHaveBeenCalled();
    expect(onCapitole).toHaveBeenCalledTimes(1);
    window.removeEventListener(CAPITOLE_SYNC_EVENT, onCapitole);
  });

  it('în varianta web (fără punte) butonul nu apare', async () => {
    mocks.canRead.value = false;
    mount();
    await flush();
    expect(screen.queryByRole('button', { name: /Sincronizează materialele/ })).toBeNull();
  });
});
