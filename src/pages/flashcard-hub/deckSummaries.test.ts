import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeckSummaries, computeActiveStreak } from './deckSummaries';
import type { Quiz } from '../../types';

const deck = (id: string, cards: number, extra: Partial<Quiz> = {}): Quiz => ({
  id, title: id, description: '', emoji: '🃏', category: 'T', kind: 'flashcard', folderId: null, createdAt: 0, color: 'blue', tags: [],
  questions: Array.from({ length: cards }, (_, i) => ({ id: `q${i}`, text: 'f', options: [{ id: 'a', text: 'b', isCorrect: true }] })),
  ...extra,
});

describe('buildDeckSummaries', () => {
  it('numără văzute, restante și stăpânite și sortează după restante', () => {
    const now = 1_000_000;
    const stats = {
      'a:q0': { nextReview: now - 1, timesCorrect: 3, timesWrong: 0 },
      'a:q1': { nextReview: now + 5, timesCorrect: 1, timesWrong: 2 },
      'b:q0': { nextReview: now - 10, timesCorrect: 0, timesWrong: 1 },
      'b:q1': { nextReview: now - 10, timesCorrect: 0, timesWrong: 1 },
    } as never;
    const result = buildDeckSummaries([deck('a', 2), deck('b', 2)], stats, now);
    expect(result.map((row) => row.quiz.id)).toEqual(['b', 'a']);
    const a = result.find((row) => row.quiz.id === 'a')!;
    expect(a).toMatchObject({ total: 2, seen: 2, due: 1, mastered: 1, masteryPct: 50 });
  });

  it('ignoră pachetele arhivate și pe cele goale', () => {
    const result = buildDeckSummaries([
      deck('ok', 1), deck('arh', 1, { archived: true }), deck('gol', 0),
    ], {} as never, 0);
    expect(result.map((row) => row.quiz.id)).toEqual(['ok']);
  });
});

describe('computeActiveStreak', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 7, 12)); });
  afterEach(() => vi.useRealTimers());

  it('păstrează seria dacă ultima zi e azi sau ieri, altfel 0', () => {
    expect(computeActiveStreak({ currentStreak: 4, lastStudyDate: '2026-10-07' })).toBe(4);
    expect(computeActiveStreak({ currentStreak: 4, lastStudyDate: '2026-10-06' })).toBe(4);
    expect(computeActiveStreak({ currentStreak: 4, lastStudyDate: '2026-10-05' })).toBe(0);
    expect(computeActiveStreak({ currentStreak: 0, lastStudyDate: '2026-10-07' })).toBe(0);
  });
});
