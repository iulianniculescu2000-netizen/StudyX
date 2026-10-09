import { describe, expect, it } from 'vitest';
import type { Folder, Quiz } from '../types';
import { curriculumChapters } from './curriculum';
import type { DeckLike, GroupNode } from './flashcardGroups';
import {
  bookChapterTag,
  collapseFolderChains,
  flashcardPickerFolders,
  groupBySpecialty,
  orderChapterFirst,
  progressSegments,
  specialtyByChapter,
  splitChapterDecks,
  summarizeDue,
} from './flashcardTreeView';

const folder = (id: string, name: string, parentId: string | null = null, scope?: 'flashcards'): Folder => ({
  id, name, emoji: '📁', color: 'blue', parentId, createdAt: 1, ...(scope ? { scope } : {}),
});
const node = (f: Folder, depth: number, children: GroupNode[] = [], decks: DeckLike[] = []): GroupNode => ({
  id: f.id, folder: f, depth, decks, children,
  deckCount: decks.length + children.reduce((n, c) => n + c.deckCount, 0), due: 0,
});
const deck = (id: string, tags: string[] = [], title = id): DeckLike => ({ due: 0, total: 10, quiz: { id, title, folderId: null, tags } });
const chapterDeck = (index: number) => deck(`c${index}`, [`chapter:${index}`, 'book:K'], `Cap ${index}`);

describe('collapseFolderChains', () => {
  it('strânge un lanț de foldere cu un singur copil într-un nod, cu calea completă', () => {
    const k = node(folder('k', 'Kumar'), 2, [], [deck('d1')]);
    const fc = node(folder('fc', 'Flashcarduri'), 1, [k]);
    const rez = node(folder('rez', 'Rezidențiat'), 0, [fc]);
    const [out] = collapseFolderChains([rez]);
    expect(out.id).toBe('k');
    expect(out.path.map((f) => f.name)).toEqual(['Rezidențiat', 'Flashcarduri', 'Kumar']);
    expect(out.depth).toBe(0);
    expect(out.deckCount).toBe(1);
  });

  it('nu strânge un folder cu pachete proprii sau cu mai mulți copii; recalculează adâncimea', () => {
    const a = node(folder('a', 'A'), 1, [], [deck('d1')]);
    const b = node(folder('b', 'B'), 1, [], [deck('d2')]);
    const root = node(folder('r', 'R'), 0, [a, b]);
    const [out] = collapseFolderChains([root]);
    expect(out.path).toHaveLength(1);
    expect(out.children.map((c) => c.depth)).toEqual([1, 1]);

    const own = node(folder('p', 'P'), 0, [node(folder('q', 'Q'), 1, [], [deck('x')])], [deck('y')]);
    expect(collapseFolderChains([own])[0].id).toBe('p');
  });

  it('un lanț în mijloc coboară adâncimea copiilor', () => {
    const leaf = node(folder('l', 'L'), 3, [], [deck('d')]);
    const mid = node(folder('m', 'M'), 2, [leaf]);
    const top = node(folder('t', 'T'), 1, [mid]);
    const root = node(folder('r', 'R'), 0, [top, node(folder('s', 'S'), 1, [], [deck('e')])]);
    const [out] = collapseFolderChains([root]);
    expect(out.children[0].id).toBe('l');
    expect(out.children[0].depth).toBe(1);
    expect(out.children[0].path.map((f) => f.name)).toEqual(['T', 'M', 'L']);
  });
});

describe('ordinea capitolelor', () => {
  it('pune capitolele primele, cronologic după planul din aplicație, restul în ordinea dată', () => {
    const list = [deck('x'), chapterDeck(10), chapterDeck(2), deck('y'), chapterDeck(0)];
    expect(orderChapterFirst(list).map((d) => d.quiz.id)).toEqual(['c0', 'c2', 'c10', 'x', 'y']);
    expect(list[0].quiz.id).toBe('x');
  });

  it('splitChapterDecks desparte capitolele de rest', () => {
    const { chapters, rest } = splitChapterDecks([deck('x'), chapterDeck(3), chapterDeck(1)]);
    expect(chapters.map((d) => d.quiz.id)).toEqual(['c1', 'c3']);
    expect(rest.map((d) => d.quiz.id)).toEqual(['x']);
  });
});

describe('numărul capitolului din carte', () => {
  it('derivă „Cap. N” din plan, fără zero în față', () => {
    const all = curriculumChapters();
    expect(bookChapterTag(all[0])).toBe('Cap. 8');
    expect(bookChapterTag(all[1])).toBe('Cap. 9');
    expect(bookChapterTag(all[10])).toBe('Cap. 30');
    expect(bookChapterTag({ index: 9999 })).toBeNull();
  });
});

describe('grupare pe specialitate', () => {
  it('derivă specialitatea din folderul planului; capitolele fără folder o iau de la cel dinainte', () => {
    const map = specialtyByChapter();
    expect(map.get(0)?.label).toBe('ATI');
    expect(map.get(1)?.label).toBe('ATI');
    expect(map.get(3)?.label).toBe('Medicină internă');
    expect(map.get(9)?.label).toBe('Medicină internă');
    expect(map.get(11)?.label).toBe('Medicină internă');
    expect(map.get(13)?.label).toBe('Boli infecțioase');
  });

  it('păstrează ordinea cronologică între și în grupuri', () => {
    const chapters = curriculumChapters();
    const items = [0, 1, 2, 3, 4, 5, 6, 8].map((i) => chapters[i]);
    const groups = groupBySpecialty(items, (c) => c);
    expect(groups.map((g) => g.label)).toEqual(['ATI', 'Medicină internă', 'Endocrinologie', 'Diabet zaharat']);
    expect(groups[1].items.map((c) => c.number)).toEqual([4, 5, 9]);
    expect(groups[1].range).toEqual([4, 9]);
  });

  it('cărțile fără foldere în plan rămân un singur grup fără etichetă', () => {
    const chapters = curriculumChapters();
    const groups = groupBySpecialty([chapters[16], chapters[17]], (c) => c);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
  });
});

describe('cifre de repetare', () => {
  it('summarizeDue numără cardurile, capitolele și alege începutul', () => {
    const out = summarizeDue([
      { total: 10, seen: 5, due: 0, mastered: 0 },
      { total: 10, seen: 5, due: 3, mastered: 0 },
      { total: 10, seen: 5, due: 7, mastered: 0 },
    ]);
    expect(out).toMatchObject({ cards: 10, chapters: 2 });
    expect(out.start?.due).toBe(7);
    expect(summarizeDue([]).start).toBeNull();
  });

  it('progressSegments: stăpânite, în învățare, noi — suma 100', () => {
    const s = progressSegments({ total: 20, seen: 10, mastered: 4 });
    expect(s.known).toBeCloseTo(20);
    expect(s.learning).toBeCloseTo(30);
    expect(s.fresh).toBeCloseTo(50);
    expect(progressSegments({ total: 0, seen: 0, mastered: 0 })).toEqual({ known: 0, learning: 0, fresh: 100 });
  });
});

describe('flashcardPickerFolders', () => {
  const quiz = (folderId: string, kind: Quiz['kind']): Pick<Quiz, 'folderId' | 'kind' | 'questions' | 'tags'> => ({ folderId, kind, questions: [], tags: [] });
  it('păstrează folderele Flashcardurilor, Rezidențiat și pe cele cu pachete (cu părinți), nu pe cele de grile', () => {
    const folders = [
      folder('fc', 'FC', null, 'flashcards'),
      folder('grile', 'Grile'),
      folder('rez', 'Rez'),
      folder('mixt', 'Mixt'),
      folder('sub', 'Sub', 'mixt'),
    ];
    const out = flashcardPickerFolders(folders, [quiz('sub', 'flashcard'), quiz('grile', 'quiz')], new Set(['rez']));
    expect(out.map((f) => f.id).sort()).toEqual(['fc', 'mixt', 'rez', 'sub']);
  });
});
