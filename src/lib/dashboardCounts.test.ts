import { describe, expect, it } from 'vitest';
import { countDashboardQuizzes } from './dashboardCounts';
import { isRezidentiatQuiz } from './rezidentiatBank';
import type { Quiz } from '../types';

function quiz(id: string, extra: Partial<Quiz> = {}): Quiz {
  return { id, title: id, description: '', emoji: '📘', category: 'test', color: 'blue', questions: [], createdAt: 1, ...extra };
}

describe('countDashboardQuizzes', () => {
  it('numără separat grilele proprii și pe cele din Rezidențiat, ca bara laterală', () => {
    const residency = quiz('r', { tags: ['rezidentiat'] });
    expect(isRezidentiatQuiz(residency)).toBe(true);
    const counts = countDashboardQuizzes([quiz('a'), quiz('b'), residency, residency, quiz('x', { archived: true })]);
    expect(counts).toEqual({ own: 2, residency: 2 });
  });
});
