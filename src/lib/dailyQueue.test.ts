import { describe, expect, it } from 'vitest';
import type { Question, QuestionStat, Quiz } from '../types';
import { buildDailyQueue, dailyPriority, minutesOf, planTimeBox, QUICK_SESSION_SECONDS, type DailyItem } from './dailyQueue';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const question = (id: string): Question => ({ id, text: id, options: [{ id: 'a', text: 'a', isCorrect: true }, { id: 'b', text: 'b', isCorrect: false }] });
const quiz = (id: string, ids: string[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: `Set ${id}`, description: '', emoji: '', category: '', kind: 'quiz', questions: ids.map(question), createdAt: 0, color: 'blue', ...extra,
});
const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview: NOW - DAY, interval: 1, ...extra,
});

describe('buildDailyQueue', () => {
  it('amestecă carduri scadente, grile scadente și greșeli neprogramate, fără dubluri', () => {
    const quizzes = [quiz('q', ['q1', 'q2', 'q3']), quiz('d', ['c1'], { kind: 'flashcard' })];
    const stats = {
      'q:q1': stat('q', 'q1'),
      'q:q2': stat('q', 'q2', { timesWrong: 2, nextReview: 0 }),
      'q:q3': stat('q', 'q3', { timesWrong: 1, nextReview: NOW + DAY }),
      'd:c1': stat('d', 'c1', { nextReview: NOW - 3 * DAY }),
    };
    const queue = buildDailyQueue({ quizzes, stats, now: NOW });
    expect(queue.items.map((i) => `${i.kind}:${i.question.id}`).sort()).toEqual(['card:c1', 'eroare:q2', 'grila:q1']);
    expect(queue.counts).toEqual({ card: 1, grila: 1, eroare: 1 });
    expect(queue.total).toBe(3);
  });

  it('o grilă greșită și scadentă apare o singură dată, ca grilă', () => {
    const queue = buildDailyQueue({ quizzes: [quiz('q', ['q1'])], stats: { 'q:q1': stat('q', 'q1', { timesWrong: 1 }) }, now: NOW });
    expect(queue.items.map((i) => i.kind)).toEqual(['grila']);
  });

  it('ordonează după întârziere și acuratețe', () => {
    const quizzes = [quiz('q', ['late', 'weak', 'fine'])];
    const stats = {
      'q:late': stat('q', 'late', { nextReview: NOW - 25 * DAY }),
      'q:weak': stat('q', 'weak', { nextReview: NOW - 2 * DAY, timesCorrect: 1, timesWrong: 4 }),
      'q:fine': stat('q', 'fine', { nextReview: NOW - 2 * DAY, timesCorrect: 9 }),
    };
    expect(buildDailyQueue({ quizzes, stats, now: NOW }).items.map((i) => i.question.id)).toEqual(['late', 'weak', 'fine']);
  });

  it('aplică plafonul zilnic și spune câte rămân', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `x${i}`);
    const stats = Object.fromEntries(ids.map((id) => [`q:${id}`, stat('q', id)]));
    const queue = buildDailyQueue({ quizzes: [quiz('q', ids)], stats, now: NOW, cap: 5 });
    expect(queue.items).toHaveLength(5);
    expect(queue.total).toBe(8);
    expect(queue.remaining).toBe(3);
  });

  it('sare peste elementele retrase și peste greșelile stăpânite', () => {
    const stats = {
      'q:a': stat('q', 'a', { retired: true }),
      'q:b': stat('q', 'b', { timesWrong: 1, nextReview: 0, consecutiveCorrect: 3 }),
    };
    expect(buildDailyQueue({ quizzes: [quiz('q', ['a', 'b'])], stats, now: NOW }).items).toEqual([]);
  });
});

describe('planTimeBox', () => {
  const items = (secs: number[]) => secs.map((seconds, i) => ({ seconds, statKey: `k${i}` }) as DailyItem);

  it('ia începutul cozii care încape în 15 minute', () => {
    const plan = planTimeBox(items(Array(40).fill(45)));
    expect(plan.items).toHaveLength(20);
    expect(plan.seconds).toBe(900);
    expect(plan.seconds).toBeLessThanOrEqual(QUICK_SESSION_SECONDS);
  });

  it('păstrează măcar un element chiar dacă depășește bugetul', () => {
    expect(planTimeBox(items([2000, 10]), 900).items).toHaveLength(1);
    expect(planTimeBox([], 900).items).toEqual([]);
  });
});

describe('prioritate și minute', () => {
  it('întârzierea și acuratețea scăzută cresc prioritatea; greșelile au un mic avans', () => {
    expect(dailyPriority('grila', 5, 40)).toBeGreaterThan(dailyPriority('grila', 5, 90));
    expect(dailyPriority('grila', 9, 90)).toBeGreaterThan(dailyPriority('grila', 1, 90));
    expect(dailyPriority('eroare', 0, 50)).toBeGreaterThan(dailyPriority('grila', 0, 50));
  });
  it('rotunjește minutele, minim 1', () => {
    expect(minutesOf(10)).toBe(1);
    expect(minutesOf(900)).toBe(15);
  });
});
