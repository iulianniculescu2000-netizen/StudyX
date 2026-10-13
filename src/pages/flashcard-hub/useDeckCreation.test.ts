import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuizStore } from '../../store/quizStore';
import { useFolderStore } from '../../store/folderStore';
import { useToastStore } from '../../store/toastStore';
import { useUserStore } from '../../store/userStore';
import { useAIStore } from '../../store/aiStore';
import { useFlashcardHubSession, getFlashcardResume } from '../../store/flashcardHubSessionStore';
import type { Folder } from '../../types';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const notesToFlashcards = vi.fn();
vi.mock('../../lib/groq', async () => {
  const actual = await vi.importActual<typeof import('../../lib/groq')>('../../lib/groq');
  return { ...actual, notesToFlashcards: (...args: unknown[]) => notesToFlashcards(...args) };
});
vi.mock('../../lib/imageProcessing', () => ({
  extractCaptionedImagesFromPdf: vi.fn(async () => []),
  renderPdfPagesAsImages: vi.fn(async () => []),
  renderPdfPagesWithText: vi.fn(async () => []),
  resizeImageFile: vi.fn(async () => 'data:image/jpeg;base64,xx'),
}));
vi.mock('../../ai/vectorStore', () => ({
  getVaultChunksBySource: vi.fn(async () => [{ text: 'a'.repeat(200) }, { text: 'b'.repeat(200) }]),
}));

import { FlashcardGenerationInterrupted, NoNewFlashcardsError } from '../../lib/groq';
import { useDeckCreation } from './useDeckCreation';

const folder = (id: string): Folder => ({ id, name: `F-${id}`, emoji: '📁', color: 'blue', parentId: null, createdAt: 0, scope: 'flashcards' });
const toasts = () => useToastStore.getState().toasts;
const decks = () => useQuizStore.getState().quizzes;

function setup(folders: Folder[] = []) {
  return renderHook(() => useDeckCreation({
    rezScope: false,
    quizzes: useQuizStore((s) => s.quizzes),
    folders,
  }));
}
const txt = (name: string, content: string) => new File([content], name, { type: 'text/plain' });
const long = 'Text de curs. '.repeat(30);

beforeEach(() => {
  navigate.mockReset();
  notesToFlashcards.mockReset();
  localStorage.clear();
  useToastStore.setState({ toasts: [] });
  useFolderStore.setState({ folders: [] });
  useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
  useUserStore.setState({ activeProfileId: 'p1' });
  useFlashcardHubSession.setState({ profileId: null, createdDeck: null, resume: null });
  useAIStore.setState({ hasKey: false } as never);
});

describe('useDeckCreation - caracterizare', () => {
  it('importă CSV, creează pachetul și navighează', async () => {
    const { result } = setup();
    await act(() => result.current.processCsvFile(txt('mat.csv', '# c\nq1;a1\nq2;a2\nbad')));
    expect(decks()).toHaveLength(1);
    expect(decks()[0].title).toBe('Deck CSV · mat');
    expect(decks()[0].tags).toEqual(['csv', 'import']);
    expect(toasts().some((t) => t.type === 'warning' && /1 linie/.test(t.message))).toBe(true);
    expect(decks()[0].questions).toHaveLength(2);
    expect(navigate).toHaveBeenCalledWith(`/flashcards/session/${decks()[0].id}?mode=all`);
    expect(result.current.csvImporting).toBe(false);
  });

  it('CSV gol setează csvError', async () => {
    const { result } = setup();
    await act(() => result.current.processCsvFile(txt('e.csv', '# doar comentariu')));
    expect(result.current.csvError).toMatch(/gol/);
    expect(decks()).toHaveLength(0);
  });

  it('generează pachet AI dintr-un TXT și îl anunță', async () => {
    notesToFlashcards.mockResolvedValue([{ front: 'F1', back: 'B1' }, { front: 'F2', back: 'B2' }]);
    const { result } = setup([folder('x')]);
    act(() => result.current.handleTargetFolderChange('x'));
    await act(() => result.current.processPdfFile(txt('curs.txt', long)));
    expect(decks()).toHaveLength(1);
    expect(decks()[0].folderId).toBe('x');
    expect(decks()[0].tags).toEqual(['ai', 'pdf']);
    expect(result.current.visibleCreatedDeck?.count).toBe(2);
    expect(toasts().some((t) => t.type === 'success')).toBe(true);
    expect(result.current.aiLoading).toBe(false);
    expect(result.current.aiProgress).toBe('');
    expect(localStorage.getItem('studyx-flashcard-last-folder')).toBe('x');
  });

  it('text prea scurt dă aiError fără apel AI', async () => {
    const { result } = setup();
    await act(() => result.current.processPdfFile(txt('s.txt', 'scurt')));
    expect(result.current.aiError).toMatch(/scanat/);
    expect(notesToFlashcards).not.toHaveBeenCalled();
  });

  it('eroare AI -> aiError + toast de eroare', async () => {
    notesToFlashcards.mockRejectedValue(new Error('boom'));
    const { result } = setup();
    await act(() => result.current.processPdfFile(txt('curs.txt', long)));
    expect(result.current.aiError).not.toBe('');
    expect(toasts().some((t) => t.type === 'error')).toBe(true);
    expect(decks()).toHaveLength(0);
  });

  it('întrerupere salvează cardurile parțiale și permite reluarea', async () => {
    notesToFlashcards.mockRejectedValueOnce(new FlashcardGenerationInterrupted([{ front: 'F1', back: 'B1' }], new Error('x'), null, 3));
    const { result } = setup();
    await act(() => result.current.processPdfFile(txt('curs.txt', long)));
    expect(decks()[0].questions).toHaveLength(1);
    expect(getFlashcardResume('p1')?.nextChunk).toBe(3);
    expect(result.current.visibleCreatedDeck?.interrupted).toBeDefined();

    notesToFlashcards.mockResolvedValueOnce([{ front: 'F2', back: 'B2' }]);
    await act(() => result.current.resumeGeneration());
    expect(decks()[0].questions).toHaveLength(2);
    expect(getFlashcardResume('p1')).toBeNull();
    expect(result.current.visibleCreatedDeck?.interrupted).toBeUndefined();
    expect(result.current.resuming).toBe(false);
  });

  it('reluare fără carduri noi curăță starea', async () => {
    notesToFlashcards.mockRejectedValueOnce(new FlashcardGenerationInterrupted([{ front: 'F1', back: 'B1' }], new Error('x'), null, 3));
    const { result } = setup();
    await act(() => result.current.processPdfFile(txt('curs.txt', long)));
    notesToFlashcards.mockRejectedValueOnce(new NoNewFlashcardsError());
    await act(() => result.current.resumeGeneration());
    expect(getFlashcardResume('p1')).toBeNull();
    expect(decks()[0].questions).toHaveLength(1);
  });

  it('generează din bibliotecă', async () => {
    useAIStore.setState({
      knowledgeSources: [{ id: 's1', name: 'Curs.pdf', indexStatus: 'ready', charCount: 10 }],
      libraryFolders: [],
    } as never);
    notesToFlashcards.mockResolvedValue([{ front: 'F', back: 'B' }]);
    const { result } = setup();
    await act(() => result.current.generateDeckFromLibrary('s1'));
    expect(decks()[0].title).toBe('Flashcarduri · Curs');
    expect(decks()[0].tags).toContain('biblioteca');
    expect(result.current.libraryGenerating).toBe(false);
  });

  it('importă poze fără cheie AI ca pachet vizual', async () => {
    const { result } = setup();
    const img = new File(['x'], 'derm1.png', { type: 'image/png' });
    await act(() => result.current.processPhotoFiles([img]));
    expect(decks()[0].title).toBe('Deck foto · derm1');
    expect(decks()[0].category).toBe('Dermatologie');
    expect(decks()[0].questions[0].imageUrl).toBe('data:image/jpeg;base64,xx');
    expect(navigate).toHaveBeenCalled();
  });

  it('poze invalide dau photoError', async () => {
    const { result } = setup();
    await act(() => result.current.processPhotoFiles([txt('a.txt', 'x')]));
    expect(result.current.photoError).toMatch(/imagini valide/);
  });

  it('pachet de greșeli', () => {
    const { result } = setup();
    act(() => result.current.createMistakeDeck());
    expect(result.current.aiError).toMatch(/greșeli/);
    useUserStore.setState({ activeProfileId: null });
    const second = setup();
    act(() => second.result.current.createMistakeDeck());
    expect(second.result.current.aiError).toMatch(/profil activ/);
  });

  it('moveCreatedDeck mută pachetul creat', async () => {
    notesToFlashcards.mockResolvedValue([{ front: 'F1', back: 'B1' }]);
    useFolderStore.setState({ folders: [folder('y')] });
    const { result } = setup([folder('y')]);
    await act(() => result.current.processPdfFile(txt('curs.txt', long)));
    act(() => result.current.moveCreatedDeck('y'));
    expect(decks()[0].folderId).toBe('y');
    expect(result.current.visibleCreatedDeck?.folderId).toBe('y');
    act(() => result.current.moveCreatedDeck('__uncategorized__'));
    expect(decks()[0].folderId).toBeNull();
  });

  it('handleCreateFolder creează folder de flashcarduri', () => {
    const { result } = setup();
    let id = '';
    act(() => { id = result.current.handleCreateFolder('Anatomie', null); });
    expect(useFolderStore.getState().folders.find((f) => f.id === id)?.scope).toBe('flashcards');
  });

  it('guardBusy blochează cât timp rulează o generare', async () => {
    let release: (v: { front: string; back: string }[]) => void = () => {};
    notesToFlashcards.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = setup();
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.processPdfFile(txt('curs.txt', long));
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    expect(result.current.aiLoading).toBe(true);
    let busy = false;
    act(() => { busy = result.current.guardBusy(); });
    expect(busy).toBe(true);
    await act(async () => { release([{ front: 'F', back: 'B' }]); await pending; });
    act(() => { busy = result.current.guardBusy(); });
    expect(busy).toBe(false);
  });
});
