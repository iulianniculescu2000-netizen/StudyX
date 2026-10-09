import { describe, expect, it } from 'vitest';
import { retireSplitSourceStats } from './retireSplitStats';
import type { QuestionStat, Quiz } from '../types';

const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 2, timesWrong: 1, lastSeen: 1, nextReview: 5, interval: 1, ...extra,
});
const quiz = (id: string, ids: string[], archived = false) =>
  ({ id, archived, questions: ids.map((qid) => ({ id: qid })) }) as unknown as Quiz;

describe('retireSplitSourceStats', () => {
  const quizzes = [quiz('src', ['a', 'b'], true), quiz('src--0', ['a']), quiz('src--1', ['b'])];

  it('marchează copia veche când sursa e arhivată și există copia nouă', () => {
    const stats = { 'src:a': stat('src', 'a'), 'src--0:a': stat('src--0', 'a') };
    const out = retireSplitSourceStats(stats, quizzes);
    expect(out['src:a']).toMatchObject({ retired: true, nextReview: 0, timesCorrect: 2 });
    expect(out['src--0:a'].retired).toBeUndefined();
  });

  it('nu atinge nimic fără copie, fără arhivare sau deja marcat; e idempotent', () => {
    const noCopy = { 'src:b': stat('src', 'b') };
    expect(retireSplitSourceStats(noCopy, quizzes)).toBe(noCopy);
    const live = [quiz('src', ['a'], false), quiz('src--0', ['a'])];
    const s2 = { 'src:a': stat('src', 'a'), 'src--0:a': stat('src--0', 'a') };
    expect(retireSplitSourceStats(s2, live)).toBe(s2);
    const once = retireSplitSourceStats({ 'src:a': stat('src', 'a'), 'src--0:a': stat('src--0', 'a') }, quizzes);
    expect(retireSplitSourceStats(once, quizzes)).toBe(once);
  });
});
