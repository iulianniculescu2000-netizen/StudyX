import { describe, expect, it } from 'vitest';
import { topicMasteryDelta } from './topicMasteryDelta';
import { TOPIC_PRACTICE_TAG } from './topicMastery';
import type { QuestionStat, Quiz } from '../types';

const NOW = 1_000_000;
const quiz = (id: string, n: number, tags: string[]): Quiz => ({
  id, title: id, category: 'Aritmii', kind: 'quiz', tags,
  questions: Array.from({ length: n }, (_, i) => ({
    id: `${id}${i}`, text: `Q${i}`, tags: ['Aritmii'],
    options: [{ id: `${id}${i}a`, text: 'A', isCorrect: true }, { id: `${id}${i}b`, text: 'B', isCorrect: false }],
  })),
}) as unknown as Quiz;
const stat = (quizId: string, questionId: string, timesCorrect: number, timesWrong: number): QuestionStat =>
  ({ quizId, questionId, timesCorrect, timesWrong, lastSeen: NOW, nextReview: 0, interval: 1 });

describe('topicMasteryDelta', () => {
  const source = quiz('src', 4, []);
  const practice = quiz('prac', 4, ['recovery', TOPIC_PRACTICE_TAG]);
  const sourceStats = Object.fromEntries(source.questions.map((q) => [`src:${q.id}`, stat('src', q.id, 0, 3)]));

  it('arată creșterea după o sesiune cu răspunsuri corecte', () => {
    const stats = {
      ...sourceStats,
      ...Object.fromEntries(practice.questions.map((q) => [`prac:${q.id}`, stat('prac', q.id, 1, 0)])),
    };
    const answers = Object.fromEntries(practice.questions.map((q) => [q.id, [`${q.id}a`]]));
    const delta = topicMasteryDelta([source, practice], stats, practice, answers, NOW)!;
    expect(delta).toMatchObject({ topic: 'Aritmii', answeredNow: 4 });
    expect(delta.after).toBeGreaterThan(delta.before!);
  });

  it('„înainte” e fără răspunsurile din sesiune, dar cu restul istoricului', () => {
    const stats = {
      ...sourceStats,
      ...Object.fromEntries(practice.questions.map((q) => [`prac:${q.id}`, stat('prac', q.id, 1, 0)])),
    };
    const answers = Object.fromEntries(practice.questions.map((q) => [q.id, [`${q.id}a`]]));
    const untouched = topicMasteryDelta([source, practice], { ...sourceStats }, practice, {}, NOW)!;
    expect(untouched).toMatchObject({ answeredNow: 0, before: 7, after: 7 });
    const delta = topicMasteryDelta([source, practice], stats, practice, answers, NOW)!;
    // 12 greșeli în sursă: (0+1)/(12+2)=7%
    expect(delta.before).toBe(7);
  });

  it('scade când răspunsurile sunt greșite', () => {
    const stats = {
      ...sourceStats,
      ...Object.fromEntries(practice.questions.map((q) => [`prac:${q.id}`, stat('prac', q.id, 0, 1)])),
    };
    const answers = Object.fromEntries(practice.questions.map((q) => [q.id, [`${q.id}b`]]));
    const delta = topicMasteryDelta([source, practice], stats, practice, answers, NOW)!;
    expect(delta.after).toBeLessThanOrEqual(delta.before!);
  });

  it('nu se aplică altor seturi', () => {
    expect(topicMasteryDelta([source], sourceStats, source, {}, NOW)).toBeNull();
  });
});
