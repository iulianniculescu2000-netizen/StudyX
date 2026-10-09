import { describe, expect, it } from 'vitest';
import type { QuestionStat, Quiz } from '../../types';
import { buildScopedPerformanceSummary, quizzesForScope, statsForScope } from './studyScope';

const quiz = (id: string, tags: string[]): Quiz => ({ id, title: id, tags, questions: [] } as unknown as Quiz);
const stat = (quizId: string, correct: number, wrong: number, nextReview = 0): QuestionStat => (
  { questionId: 'q', quizId, timesCorrect: correct, timesWrong: wrong, lastSeen: 1, nextReview, interval: 1 } as QuestionStat
);

const quizzes = [quiz('general', ['anatomie']), quiz('rezi', ['rezidentiat']), quiz('bank', ['rezidentiat-bank:cardio'])];
const stats = {
  'general:1': stat('general', 3, 1),
  'rezi:1': stat('rezi', 1, 9, 1),
  'bank:1': stat('bank', 0, 5),
};

describe('studyScope', () => {
  it('împarte grilele între general și rezidențiat', () => {
    expect(quizzesForScope(quizzes, 'general').map((q) => q.id)).toEqual(['general']);
    expect(quizzesForScope(quizzes, 'rezidentiat').map((q) => q.id)).toEqual(['rezi', 'bank']);
  });

  it('statisticile fiecărui spațiu conțin doar întrebările lui', () => {
    expect(Object.keys(statsForScope(stats, quizzes, 'general'))).toEqual(['general:1']);
    expect(Object.keys(statsForScope(stats, quizzes, 'rezidentiat')).sort()).toEqual(['bank:1', 'rezi:1']);
  });

  it('rezumatul de performanță nu amestecă răspunsurile din celălalt spațiu', () => {
    const general = buildScopedPerformanceSummary('general', stats, { currentStreak: 2 }, quizzes);
    expect(general.totalAnswered).toBe(4);
    expect(general.globalAccuracy).toBe(75);
    expect(general.dueCount).toBe(0);
    const rezi = buildScopedPerformanceSummary('rezidentiat', stats, { currentStreak: 2 }, quizzes);
    expect(rezi.totalAnswered).toBe(15);
    expect(rezi.dueCount).toBe(1);
  });
});
