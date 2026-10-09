import { beforeEach, describe, expect, it } from 'vitest';
import kumarDeck from '../data/rezidentiat/kumar_flashcards.json';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { buildDueItems } from './dueItems';
import {
  applyChapterSplit,
  chapterDeckId,
  chapterOfDeck,
  findSplittableDecks,
  isSplitDone,
  planChapterSplit,
  summarizeChapterDecks,
  undoChapterSplit,
} from './chapterDecks';
import { startKumarDeck } from './startKumarDeck';
import type { Question, QuestionStat, Quiz } from '../types';

type Card = Question & { category?: string; sourceBook?: string };

const card = (id: string, category: string | undefined, sourceBook = 'Kumar'): Card => ({
  id,
  text: `Întrebare ${id}?`,
  multipleCorrect: false,
  options: [{ id: `${id}-a`, text: 'răspuns', isCorrect: true }],
  category,
  sourceBook,
});

function source(): Quiz {
  const cards: Card[] = [
    ...Array.from({ length: 4 }, (_, i) => card(`s${i}`, 'Sepsis')),
    ...Array.from({ length: 3 }, (_, i) => card(`c${i}`, 'Cardiologie')),
    ...Array.from({ length: 2 }, (_, i) => card(`d${i}`, 'Diabet zaharat')),
    card('x0', 'Subiect necunoscut'),
    card('x1', undefined),
  ];
  return {
    id: 'src',
    title: 'Set mare',
    description: '',
    emoji: '⚡',
    category: 'Rezidențiat',
    kind: 'flashcard',
    color: 'blue',
    questions: cards,
    createdAt: 5,
  };
}

const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId,
  questionId,
  timesCorrect: 3,
  timesWrong: 0,
  lastSeen: 100,
  nextReview: 1,
  interval: 6,
  eFactor: 2.5,
  ...extra,
});

beforeEach(() => {
  useFolderStore.getState()._hydrate({ folders: [] });
  useQuizStore.getState()._hydrate({ quizzes: [], sessions: [] });
  useStatsStore.getState().reset();
});

describe('planChapterSplit', () => {
  it('grupează după capitol, în ordinea planului, cu „Alte” la sfârșit', () => {
    const plan = planChapterSplit(source());
    expect(plan.total).toBe(11);
    expect(plan.chapterCount).toBe(3);
    expect(plan.assigned).toBe(9);
    expect(plan.other).toBe(2);
    expect(plan.groups.map((g) => g.questions.length)).toEqual([4, 2, 3, 2]);
    expect(plan.groups[0].title).toBe('1. Sepsisul și tratamentul infecțiilor bacteriene');
    expect(plan.groups[0].id).toBe(chapterDeckId('src', 0));
    expect(plan.groups.at(-1)?.chapter).toBeNull();
    expect(plan.splittable).toBe(true);
  });

  it('nu oferă împărțirea când aproape nimic nu are capitol', () => {
    const quiz = source();
    quiz.questions = quiz.questions.map((q, i) => ((q as Card).category === 'Sepsis' && i < 3 ? { ...q, category: 'Altceva' } : q));
    const plan = planChapterSplit(quiz);
    expect(plan.assigned).toBe(6);
    expect(planChapterSplit({ ...quiz, questions: quiz.questions.slice(0, 4) }).splittable).toBe(false);
  });

  it('pachetul Kumar livrat: toate cele 552 de carduri au capitol, fără „Alte”', () => {
    const plan = planChapterSplit(kumarDeck as unknown as Quiz);
    expect(plan.total).toBe(552);
    expect(plan.other).toBe(0);
    expect(plan.chapterCount).toBe(15);
    expect(plan.groups.reduce((n, g) => n + g.questions.length, 0)).toBe(552);
  });
});

describe('applyChapterSplit', () => {
  it('creează pachete cu contractul de taguri, în Rezidențiat / Flashcarduri / Kumar', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    const result = applyChapterSplit(src);
    expect(result.created).toBe(4);

    const quizzes = useQuizStore.getState().quizzes;
    const sepsis = quizzes.find((q) => q.id === chapterDeckId('src', 0))!;
    expect(sepsis.kind).toBe('flashcard');
    expect(sepsis.tags).toEqual(['rezidentiat', 'chapter:0', 'book:K']);
    expect(chapterOfDeck(sepsis)).toEqual({ index: 0, book: 'K' });
    expect(sepsis.questions).toHaveLength(4);

    const folders = useFolderStore.getState().folders;
    const bookFolder = folders.find((f) => f.id === sepsis.folderId)!;
    const mid = folders.find((f) => f.id === bookFolder.parentId)!;
    const root = folders.find((f) => f.id === mid.parentId)!;
    expect([root.name, mid.name, bookFolder.name]).toEqual(['Rezidențiat', 'Flashcarduri', 'Kumar']);
    expect(root.parentId).toBeNull();
  });

  it('păstrează istoricul: copiază cheile vechi pe cele noi și nu le șterge', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0', { timesCorrect: 7 }), 'src:c1': stat('src', 'c1') } });
    const result = applyChapterSplit(src);
    expect(result.copiedStats).toBe(2);

    const stats = useStatsStore.getState().questionStats;
    expect(stats[`${chapterDeckId('src', 0)}:s0`]).toMatchObject({ quizId: chapterDeckId('src', 0), questionId: 's0', timesCorrect: 7 });
    expect(stats[`${chapterDeckId('src', 10)}:c1`]).toMatchObject({ quizId: chapterDeckId('src', 10), questionId: 'c1' }); // cardiologia e capitolul 11
    // Cheile vechi rămân cu tot istoricul, dar ies din coada de repetare.
    expect(stats['src:s0']).toMatchObject({ timesCorrect: 7, nextReview: 0 });
    expect(stats['src:c1']).toMatchObject({ timesCorrect: 3, nextReview: 0 });
    expect(stats[`${chapterDeckId('src', 0)}:s0`].nextReview).toBe(1);
  });

  it('istoricul copiat nu se numără de două ori în statistici, iar „Anulează” îl readuce', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0', { timesCorrect: 7, timesWrong: 3 }) } });
    applyChapterSplit(src);
    expect(useStatsStore.getState().questionStats['src:s0'].retired).toBe(true);
    expect(useStatsStore.getState().getAccuracy()).toBe(70);
    const all = Object.values(useStatsStore.getState().questionStats);
    expect(all.filter((s) => !s.retired).reduce((n, s) => n + s.timesCorrect + s.timesWrong, 0)).toBe(10);

    undoChapterSplit('src');
    expect(useStatsStore.getState().questionStats['src:s0'].retired).toBeUndefined();
    expect(useStatsStore.getState().getAccuracy()).toBe(70);
  });

  it('arhivează sursa fără s-o șterge, iar recapitularea zilnică nu numără dublu', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0') } });
    applyChapterSplit(src);
    const quizzes = useQuizStore.getState().quizzes;
    expect(quizzes.find((q) => q.id === 'src')?.archived).toBe(true);
    expect(isSplitDone(quizzes, 'src')).toBe(true);
    // Pachetele de flashcarduri (și sursa arhivată) au repetiția lor: coada de grile rămâne goală.
    expect(buildDueItems(useStatsStore.getState().questionStats, quizzes, Date.now())).toEqual([]);
  });

  it('contoarele de scadente (getDueQuestions) nu se dublează după împărțire', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0'), 'src:s1': stat('src', 's1') } });
    expect(useStatsStore.getState().getDueQuestions()).toHaveLength(2);
    applyChapterSplit(src);
    expect(useStatsStore.getState().getDueQuestions()).toHaveLength(2);
    undoChapterSplit('src');
    expect(useStatsStore.getState().getDueQuestions()).toHaveLength(2);
  });

  it('etichetele chapter:/book: nu devin „subiecte” și sursa arhivată nu dublează statisticile pe etichete', () => {
    const src = { ...source(), tags: ['flashcard'] };
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0') } });
    applyChapterSplit(src);
    const byTag = useStatsStore.getState().getStatsByTag(useQuizStore.getState().quizzes);
    expect(Object.keys(byTag).some((tag) => /^(chapter|book):/.test(tag))).toBe(false);
    expect(Object.values(byTag).every((value) => value.total <= 3)).toBe(true);
  });

  it('este idempotentă: a doua rulare nu duplică pachete, carduri sau statistici', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0') } });
    applyChapterSplit(src);
    const before = JSON.stringify([useQuizStore.getState().quizzes, useStatsStore.getState().questionStats]);
    const second = applyChapterSplit(src);
    expect(second).toMatchObject({ created: 0, updated: 0, copiedStats: 0, archivedSource: false });
    expect(JSON.stringify([useQuizStore.getState().quizzes, useStatsStore.getState().questionStats])).toBe(before);
    expect(useQuizStore.getState().quizzes).toHaveLength(5);
  });

  it('nu suprascrie progresul făcut deja în pachetul de capitol', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0', { timesCorrect: 1 }) } });
    applyChapterSplit(src);
    const key = `${chapterDeckId('src', 0)}:s0`;
    useStatsStore.setState((s) => ({ questionStats: { ...s.questionStats, [key]: { ...s.questionStats[key], timesCorrect: 9 } } }));
    applyChapterSplit(src);
    expect(useStatsStore.getState().questionStats[key].timesCorrect).toBe(9);
  });

  it('un pachet neadăugat în store (utilizator nou) nu arhivează nimic', () => {
    const result = applyChapterSplit(source());
    expect(result.created).toBe(4);
    expect(result.archivedSource).toBe(false);
    expect(useQuizStore.getState().quizzes.some((q) => q.id === 'src')).toBe(false);
  });
});

describe('undoChapterSplit', () => {
  it('readuce sursa, șterge pachetele de capitol și trece înapoi progresul nou', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0', { timesCorrect: 2, lastSeen: 100 }) } });
    applyChapterSplit(src);
    const key = `${chapterDeckId('src', 0)}:s0`;
    const newKey = `${chapterDeckId('src', 0)}:s1`;
    useStatsStore.setState((s) => ({
      questionStats: {
        ...s.questionStats,
        [key]: { ...s.questionStats[key], timesCorrect: 5, lastSeen: 500 },
        [newKey]: stat(chapterDeckId('src', 0), 's1', { lastSeen: 600 }),
      },
    }));

    const undo = undoChapterSplit('src');
    expect(undo).toMatchObject({ restored: true, removedDecks: 4, copiedBack: 2 });
    const quizzes = useQuizStore.getState().quizzes;
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0]).toMatchObject({ id: 'src', archived: false });
    expect(quizzes[0].questions).toHaveLength(11);

    const stats = useStatsStore.getState().questionStats;
    expect(stats['src:s0'].timesCorrect).toBe(5);
    expect(stats['src:s1']).toBeDefined();
    expect(Object.keys(stats).some((k) => k.startsWith('src--'))).toBe(false);
  });

  it('se poate împărți din nou după anulare, fără pierderi', () => {
    const src = source();
    useQuizStore.getState().addQuiz(src);
    useStatsStore.setState({ questionStats: { 'src:s0': stat('src', 's0') } });
    applyChapterSplit(src);
    undoChapterSplit('src');
    const again = applyChapterSplit(useQuizStore.getState().quizzes[0]);
    expect(again.created).toBe(4);
    expect(useStatsStore.getState().questionStats[`${chapterDeckId('src', 0)}:s0`]).toBeDefined();
  });

  it('fără împărțire anterioară nu face nimic', () => {
    useQuizStore.getState().addQuiz(source());
    expect(undoChapterSplit('src')).toEqual({ restored: false, removedDecks: 0, copiedBack: 0 });
  });
});

describe('findSplittableDecks / summarizeChapterDecks', () => {
  it('oferă doar pachetele nesplit; după împărțire dispar din ofertă', () => {
    useQuizStore.getState().addQuiz(source());
    expect(findSplittableDecks(useQuizStore.getState().quizzes).map((p) => p.sourceId)).toEqual(['src']);
    applyChapterSplit(source());
    expect(findSplittableDecks(useQuizStore.getState().quizzes)).toEqual([]);
  });

  it('rezumă pe cărți: carduri, scadente și stăpânite per capitol', () => {
    useQuizStore.getState().addQuiz(source());
    applyChapterSplit(source());
    const deck = chapterDeckId('src', 0);
    useStatsStore.setState({
      questionStats: {
        [`${deck}:s0`]: stat(deck, 's0', { nextReview: 1 }),
        [`${deck}:s1`]: stat(deck, 's1', { nextReview: 9_999_999_999_999, timesCorrect: 0, timesWrong: 2 }),
      },
    });
    const sections = summarizeChapterDecks(useQuizStore.getState().quizzes, useStatsStore.getState().questionStats, Date.now());
    expect(sections).toHaveLength(1);
    expect(sections[0].book).toBe('K');
    expect(sections[0].rows.map((r) => r.chapter.index)).toEqual([0, 6, 10]); // „Alte” nu apare
    expect(sections[0].rows[0]).toMatchObject({ total: 4, seen: 2, due: 1, mastered: 1 });
    expect(sections[0].total).toBe(9);
  });

  it('pachetul arhivat și sursa nu intră în vedere', () => {
    useQuizStore.getState().addQuiz(source());
    applyChapterSplit(source());
    const quizzes = useQuizStore.getState().quizzes.map((q) => (q.id === chapterDeckId('src', 0) ? { ...q, archived: true } : q));
    expect(summarizeChapterDecks(quizzes, {}, Date.now())[0].rows.map((r) => r.chapter.index)).toEqual([6, 10]);
  });
});

describe('startKumarDeck', () => {
  it('utilizator nou: cardurile intră direct pe capitole, fără pachetul unic', async () => {
    const id = await startKumarDeck();
    const quizzes = useQuizStore.getState().quizzes;
    expect(id).toBe(chapterDeckId('rezi-kumar-flashcards-1', 0));
    expect(quizzes.some((q) => q.id === 'rezi-kumar-flashcards-1')).toBe(false);
    expect(quizzes.filter((q) => chapterOfDeck(q))).toHaveLength(15);
    expect(quizzes.reduce((n, q) => n + q.questions.length, 0)).toBe(552);
    // A doua deschidere nu duplică.
    await startKumarDeck();
    expect(useQuizStore.getState().quizzes).toHaveLength(15);
  });

  it('cine are pachetul unic îl păstrează neîmpărțit până cere împărțirea', async () => {
    useQuizStore.getState().addQuiz({ ...(kumarDeck as unknown as Quiz), folderId: null });
    const id = await startKumarDeck();
    expect(id).toBe('rezi-kumar-flashcards-1');
    expect(useQuizStore.getState().quizzes).toHaveLength(1);
    expect(useQuizStore.getState().quizzes[0].archived).toBeFalsy();
  });

  it('după împărțire, reîmprospătarea merge în pachetele de capitol, nu în sursa arhivată', async () => {
    const src = { ...(kumarDeck as unknown as Quiz), folderId: null };
    useQuizStore.getState().addQuiz(src);
    applyChapterSplit(src);
    const count = useQuizStore.getState().quizzes.length;
    await startKumarDeck();
    expect(useQuizStore.getState().quizzes).toHaveLength(count);
    expect(useQuizStore.getState().quizzes.find((q) => q.id === src.id)?.archived).toBe(true);
  });
});
