import { describe, expect, it } from 'vitest';
import { calcNextReview, countWeakStats, existingStatKeys, FLASHCARD_RELEARN_MS, isDueStat, isWeakStat } from './statsStore';
import type { QuestionStat } from '../types';

const DAY = 86400000;
const fresh = (): QuestionStat => ({
  questionId: 'c', quizId: 'q', timesCorrect: 0, timesWrong: 0, lastSeen: 0, nextReview: 0, interval: 0, eFactor: 2.5, consecutiveCorrect: 0,
});

describe('first-pass intervals per rating', () => {
  it('Greu / Bine / Ușor schedule different first reviews', () => {
    const hard = calcNextReview(fresh(), false, undefined, { flashcard: true });
    const good = calcNextReview(fresh(), true);
    const easy = calcNextReview(fresh(), true, 'confident');
    const now = Date.now();
    expect(hard.nextReview - now).toBeLessThan(DAY / 2);
    expect(hard.nextReview - now).toBeGreaterThan(0);
    expect(Math.round((good.nextReview - now) / DAY)).toBe(1);
    expect(Math.round((easy.nextReview - now) / DAY)).toBe(4);
  });

  it('a wrong quiz answer still returns tomorrow; a hard flashcard returns within minutes', () => {
    const quiz = calcNextReview(fresh(), false);
    const card = calcNextReview(fresh(), false, undefined, { flashcard: true });
    expect(Math.round((quiz.nextReview - Date.now()) / DAY)).toBe(1);
    expect(card.nextReview - Date.now()).toBeLessThanOrEqual(FLASHCARD_RELEARN_MS);
  });

  it('keeps n=1 -> 6 days and the 365-day cap', () => {
    expect(calcNextReview({ ...fresh(), consecutiveCorrect: 1, interval: 1 }, true).interval).toBe(6);
    expect(calcNextReview({ ...fresh(), consecutiveCorrect: 5, interval: 300 }, true, 'confident').interval).toBe(365);
  });
});

describe('weak / due helpers', () => {
  const base = { lastSeen: 1, nextReview: 0, interval: 1, eFactor: 2.5 };
  const mk = (over: Partial<QuestionStat>): QuestionStat => ({ ...base, questionId: 'a', quizId: 'q', timesCorrect: 0, timesWrong: 0, consecutiveCorrect: 0, ...over });

  it('weak means wrong at least once and not stabilised', () => {
    expect(isWeakStat(mk({ timesCorrect: 1, consecutiveCorrect: 1 }))).toBe(false);
    expect(isWeakStat(mk({ timesCorrect: 1, timesWrong: 1, consecutiveCorrect: 1 }))).toBe(true);
    expect(isWeakStat(mk({ timesCorrect: 5, timesWrong: 1, consecutiveCorrect: 4 }))).toBe(false);
    expect(isWeakStat(mk({ timesWrong: 2, retired: true }))).toBe(false);
  });

  it('counts exactly, ignores orphans and is not capped at 10', () => {
    const stats: Record<string, QuestionStat> = {};
    for (let i = 0; i < 25; i++) stats[`q:${i}`] = mk({ questionId: String(i), timesWrong: 1 });
    stats['gone:1'] = mk({ quizId: 'gone', questionId: '1', timesWrong: 1 });
    expect(countWeakStats(stats)).toBe(26);
    const keys = existingStatKeys([{ id: 'q', questions: Array.from({ length: 25 }, (_, i) => ({ id: String(i) })) as never }]);
    expect(countWeakStats(stats, keys)).toBe(25);
  });

  it('retired entries are never due', () => {
    expect(isDueStat(mk({ nextReview: 5, retired: true }), 10)).toBe(false);
    expect(isDueStat(mk({ nextReview: 5 }), 10)).toBe(true);
  });
});
