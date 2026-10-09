import { describe, expect, it } from 'vitest';
import { curriculumChapters } from './curriculum';
import {
  buildDueQueue, dueGroupPath, dueSessionPath, isDueSessionId, parseDueSelection, tallyByGroup,
} from './flashcardDueQueue';
import type { Folder, Question, QuestionStat, Quiz } from '../types';

const NOW = 1_000_000_000;
const DAY = 86_400_000;

const q = (id: string): Question => ({ id, text: `Q ${id}`, options: [{ id: `${id}a`, text: 'r', isCorrect: true }] });
const deck = (id: string, count: number, extra: Partial<Quiz> = {}): Quiz => ({
  id, title: `Pachet ${id}`, description: '', emoji: '', category: '', kind: 'flashcard', color: 'blue', createdAt: 0,
  questions: Array.from({ length: count }, (_, i) => q(`${id}${i}`)),
  ...extra,
});
const chapterDeck = (id: string, index: number, count: number) => deck(id, count, { tags: ['rezidentiat', `chapter:${index}`, 'book:K'] });
const stat = (quizId: string, questionId: string, nextReview: number, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview, interval: 1, ...extra,
});
const statsFor = (quiz: Quiz, overdueDays: number[]): Record<string, QuestionStat> => Object.fromEntries(
  quiz.questions.map((question, i) => [`${quiz.id}:${question.id}`, stat(quiz.id, question.id, NOW - overdueDays[i] * DAY)]),
);

describe('buildDueQueue', () => {
  it('ia doar cardurile restante, cele mai întârziate primele', () => {
    const a = deck('a', 4);
    const stats = {
      ...statsFor(a, [1, 5, 3, 0]),
      'a:a3': stat('a', 'a3', NOW + DAY), // în viitor
    };
    const { items, totalDue } = buildDueQueue({ quizzes: [a], stats, now: NOW });
    expect(items.map((item) => item.question.id)).toEqual(['a1', 'a2', 'a0']);
    expect(totalDue).toBe(3);
  });

  it('întrețese capitolele: unul mare nu acaparează sesiunea', () => {
    const big = chapterDeck('big', 0, 4);
    const small = chapterDeck('small', 1, 2);
    const stats = { ...statsFor(big, [10, 9, 8, 7]), ...statsFor(small, [2, 1]) };
    const { items } = buildDueQueue({ quizzes: [big, small], stats, now: NOW });
    expect(items.map((item) => item.quiz.id)).toEqual(['big', 'small', 'big', 'small', 'big', 'big']);
  });

  it('respectă limita și spune câte au rămas', () => {
    const a = deck('a', 8);
    const stats = statsFor(a, [8, 7, 6, 5, 4, 3, 2, 1]);
    const queue = buildDueQueue({ quizzes: [a], stats, now: NOW, cap: 3 });
    expect(queue.items).toHaveLength(3);
    expect(queue.totalDue).toBe(8);
    expect(queue.remainingDue).toBe(5);
    expect(queue.items[0].question.id).toBe('a0');
  });

  it('exclude statisticile retired, pachetele arhivate și cele care nu sunt flashcarduri', () => {
    const a = deck('a', 2);
    const old = deck('old', 1, { archived: true });
    const grila = deck('g', 1, { kind: 'quiz' });
    const stats = {
      'a:a0': stat('a', 'a0', NOW - DAY, { retired: true }),
      'a:a1': stat('a', 'a1', NOW - DAY),
      'old:old0': stat('old', 'old0', NOW - DAY),
      'g:g0': stat('g', 'g0', NOW - DAY),
    };
    const { items } = buildDueQueue({ quizzes: [a, old, grila], stats, now: NOW, includeNew: 5 });
    expect(items.map((item) => item.statKey)).toEqual(['a:a1']);
  });

  it('cardurile noi apar doar la cerere, după restante, cu maxim N', () => {
    const a = deck('a', 5);
    const stats = { 'a:a0': stat('a', 'a0', NOW - DAY) };
    expect(buildDueQueue({ quizzes: [a], stats, now: NOW }).items).toHaveLength(1);
    const withNew = buildDueQueue({ quizzes: [a], stats, now: NOW, includeNew: 2 });
    expect(withNew.items.map((item) => [item.question.id, item.isNew])).toEqual([['a0', false], ['a1', true], ['a2', true]]);
    expect(withNew.totalNew).toBe(4);
  });

  it('filtrează pe id-uri și pe folder (cu subfoldere)', () => {
    const a = deck('a', 1, { folderId: 'f1' });
    const b = deck('b', 1, { folderId: 'f2' });
    const c = deck('c', 1);
    const stats = { ...statsFor(a, [1]), ...statsFor(b, [1]), ...statsFor(c, [1]) };
    const folders: Pick<Folder, 'id' | 'parentId'>[] = [{ id: 'f1', parentId: null }, { id: 'f2', parentId: 'f1' }];
    const ids = (opts: object) => buildDueQueue({ quizzes: [a, b, c], stats, now: NOW, ...opts }).items.map((i) => i.quiz.id).sort();
    expect(ids({ deckIds: ['a', 'c'] })).toEqual(['a', 'c']);
    expect(ids({ folderId: 'f1', folders })).toEqual(['a', 'b']);
    expect(ids({})).toEqual(['a', 'b', 'c']);
  });

  it('etichetează capitolul și revine la titlul pachetului pentru restul', () => {
    const ch = chapterDeck('ch', 7, 1);
    const plain = deck('p', 1);
    const stats = { ...statsFor(ch, [1]), ...statsFor(plain, [1]) };
    const { items } = buildDueQueue({ quizzes: [ch, plain], stats, now: NOW });
    const chapter = curriculumChapters()[7];
    expect(items.find((i) => i.quiz.id === 'ch')?.groupLabel).toBe(`Cap. ${chapter.number} · ${chapter.title}`);
    expect(items.find((i) => i.quiz.id === 'p')?.groupLabel).toBe('Pachet p');
  });

  it('cheia de statistici e mereu cea reală a pachetului', () => {
    const a = deck('a', 1);
    const { items } = buildDueQueue({ quizzes: [a], stats: statsFor(a, [1]), now: NOW });
    expect(items[0].statKey).toBe('a:a0');
  });
});

describe('rute și selecție', () => {
  it('recunoaște id-urile virtuale', () => {
    expect(isDueSessionId('due')).toBe(true);
    expect(isDueSessionId('due-group')).toBe(true);
    expect(isDueSessionId('all')).toBe(false);
    expect(isDueSessionId(undefined)).toBe(false);
  });

  it('dueSessionPath și parseDueSelection se potrivesc', () => {
    const path = dueSessionPath(['a', 'b', 'a']);
    expect(path.startsWith('/flashcards/session/due?')).toBe(true);
    const params = new URLSearchParams(path.split('?')[1]);
    expect(parseDueSelection(params)).toEqual({ deckIds: ['a', 'b'], folderId: null, includeNew: 0 });
    expect(parseDueSelection(new URLSearchParams('group=f1&new=10'))).toEqual({ deckIds: null, folderId: 'f1', includeNew: 10 });
    expect(parseDueSelection(new URLSearchParams('new=abc')).includeNew).toBe(0);
    expect(dueGroupPath('f1')).toBe('/flashcards/session/due-group?group=f1');
  });

  it('tallyByGroup numără pe capitole', () => {
    const items = [
      { groupKey: 'x', groupLabel: 'X' }, { groupKey: 'y', groupLabel: 'Y' }, { groupKey: 'x', groupLabel: 'X' },
    ];
    expect(tallyByGroup(items, ['hard', 'easy', 'good'])).toEqual([
      { groupKey: 'x', label: 'X', cards: 2, hard: 1, good: 1, easy: 0 },
      { groupKey: 'y', label: 'Y', cards: 1, hard: 0, good: 0, easy: 1 },
    ]);
  });
});
