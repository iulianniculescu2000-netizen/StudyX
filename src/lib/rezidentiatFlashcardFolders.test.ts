import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from '../store/folderStore';
import {
  FLASHCARDS_ROOT_CHOICE,
  buildManualDeck,
  ensureFlashcardsRoot,
  flashcardFolderOptions,
  parseFlashcardLines,
  resolveFolderChoice,
} from './rezidentiatFlashcardFolders';

beforeEach(() => useFolderStore.setState({ folders: [] }));

describe('foldere de flashcarduri în Rezidențiat', () => {
  it('creează „Rezidențiat / Flashcarduri” o singură dată', () => {
    const first = ensureFlashcardsRoot();
    const second = ensureFlashcardsRoot();
    expect(second).toBe(first);
    const names = useFolderStore.getState().folders.map((folder) => folder.name).sort();
    expect(names).toEqual(['Flashcarduri', 'Rezidențiat']);
  });

  it('un folder nou se creează sub Flashcarduri și nu se dublează la a doua cerere', () => {
    const id = resolveFolderChoice({ mode: 'new', name: ' Cardiologie  ', parentId: FLASHCARDS_ROOT_CHOICE });
    const again = resolveFolderChoice({ mode: 'new', name: 'cardiologie', parentId: FLASHCARDS_ROOT_CHOICE });
    expect(again).toBe(id);
    const folder = useFolderStore.getState().folders.find((entry) => entry.id === id)!;
    expect(folder.name).toBe('Cardiologie');
    expect(folder.parentId).toBe(ensureFlashcardsRoot());
  });

  it('alegerea „Flashcarduri” se rezolvă la folderul real, iar un folder existent rămâne neschimbat', () => {
    const real = resolveFolderChoice({ mode: 'existing', id: FLASHCARDS_ROOT_CHOICE });
    expect(real).toBe(ensureFlashcardsRoot());
    const sub = resolveFolderChoice({ mode: 'new', name: 'Neurologie', parentId: real });
    expect(resolveFolderChoice({ mode: 'existing', id: sub })).toBe(sub);
  });

  it('oferă doar Flashcarduri și ce e sub el, cu căi scurte', () => {
    expect(flashcardFolderOptions([])).toEqual([{ id: FLASHCARDS_ROOT_CHOICE, label: 'Flashcarduri', depth: 0 }]);
    const parent = resolveFolderChoice({ mode: 'new', name: 'Cardiologie', parentId: FLASHCARDS_ROOT_CHOICE });
    resolveFolderChoice({ mode: 'new', name: 'Aritmii', parentId: parent });
    useFolderStore.getState().addFolder('Grile', '📘', 'blue', useFolderStore.getState().folders.find((f) => f.name === 'Rezidențiat')!.id);
    const options = flashcardFolderOptions(useFolderStore.getState().folders);
    expect(options.map((option) => option.label)).toEqual(['Flashcarduri', 'Cardiologie', 'Cardiologie / Aritmii']);
    expect(options.map((option) => option.depth)).toEqual([0, 1, 2]);
  });

  it('un nume gol cade pe folderul-părinte', () => {
    const root = ensureFlashcardsRoot();
    expect(resolveFolderChoice({ mode: 'new', name: '   ', parentId: root })).toBe(root);
  });
});

describe('citirea cardurilor din text', () => {
  it('recunoaște tab, punct și virgulă, bară verticală și virgulă', () => {
    expect(parseFlashcardLines('Ce este HTA?\tTensiune crescută').cards).toEqual([{ front: 'Ce este HTA?', back: 'Tensiune crescută' }]);
    expect(parseFlashcardLines('Față;Spate\nA;B').cards).toHaveLength(2);
    expect(parseFlashcardLines('Față | Spate').cards[0]).toEqual({ front: 'Față', back: 'Spate' });
    expect(parseFlashcardLines('"Ce este, de fapt, HTA?",Tensiune crescută').cards[0].back).toBe('Tensiune crescută');
  });

  it('ignoră comentariile și numără liniile sărite', () => {
    const parsed = parseFlashcardLines('# comentariu\nOK;Da\nfără separator\n;gol');
    expect(parsed.cards).toEqual([{ front: 'OK', back: 'Da' }]);
    expect(parsed.skipped).toBe(2);
  });

  it('un text gol nu dă carduri', () => {
    expect(parseFlashcardLines('  \n# doar comentariu')).toEqual({ cards: [], skipped: 0 });
  });
});

describe('pachet manual', () => {
  it('construiește un pachet de rezidențiat și sare peste cardurile incomplete', () => {
    const deck = buildManualDeck({
      title: '  Aritmii  ',
      folderId: 'f1',
      cards: [{ front: 'Ce este AVNRT?', back: 'Tahicardie prin reintrare în nodul AV.' }, { front: 'Gol', back: '  ' }],
    });
    expect(deck.title).toBe('Aritmii');
    expect(deck.kind).toBe('flashcard');
    expect(deck.folderId).toBe('f1');
    expect(deck.tags).toEqual(['flashcard', 'manual', 'rezidentiat']);
    expect(deck.questions).toHaveLength(1);
    expect(deck.questions[0].options[0].isCorrect).toBe(true);
  });

  it('un titlu gol primește un nume implicit', () => {
    expect(buildManualDeck({ title: ' ', folderId: 'f', cards: [], origin: 'import' }).title).toBe('Pachet nou');
  });
});
