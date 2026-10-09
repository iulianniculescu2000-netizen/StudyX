import { describe, expect, it } from 'vitest';
import { buildScoreForecast, netScore, forecastConfidence, type ForecastInput } from './analyticsForecast';
import type { QuestionStat, Quiz, QuizSession } from '../types';

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = 86_400_000;

function quiz(id: string, n: number, extra: Partial<Quiz> = {}): Quiz {
  return {
    id, title: id, description: '', emoji: '', category: 'Cardiologie', kind: 'quiz', color: 'blue', createdAt: 1,
    questions: Array.from({ length: n }, (_, i) => ({ id: `${id}-q${i}`, text: `Enunț ${id} ${i}`, options: ['a', 'b', 'c', 'd'].map((x) => ({ id: x, text: x, isCorrect: x === 'a' })) })),
    ...extra,
  } as Quiz;
}

function stat(quizId: string, questionId: string, correct: number, wrong: number, extra: Partial<QuestionStat> = {}): QuestionStat {
  return { questionId, quizId, timesCorrect: correct, timesWrong: wrong, lastSeen: NOW - DAY, nextReview: NOW + 5 * DAY, interval: 6, ...extra };
}

function statsFor(q: Quiz, count: number, correct: number, wrong: number, extra: Partial<QuestionStat> = {}) {
  const out: Record<string, QuestionStat> = {};
  q.questions.slice(0, count).forEach((question) => { out[`${q.id}:${question.id}`] = stat(q.id, question.id, correct, wrong, extra); });
  return out;
}

const base = (quizzes: Quiz[], questionStats: Record<string, QuestionStat> = {}, extra: Partial<ForecastInput> = {}): ForecastInput => ({
  quizzes, questionStats, sessions: [], folders: [], now: NOW, ...extra,
});

describe('netScore', () => {
  it('is +1 per right and -0.25 per wrong over 200 questions', () => {
    expect(netScore(100)).toBe(200);
    expect(netScore(80)).toBe(150);
    expect(netScore(20)).toBe(0);
    expect(netScore(0)).toBe(-50);
  });
});

describe('forecastConfidence', () => {
  it('says few data under 10 distinct questions', () => {
    expect(forecastConfidence(9)).toBe('few');
    expect(forecastConfidence(10)).toBe('some');
    expect(forecastConfidence(40)).toBe('enough');
    expect(forecastConfidence(200, 10)).toBe('some');
  });
});

describe('buildScoreForecast', () => {
  it('has no forecast for no questions and a wide one for no answers', () => {
    expect(buildScoreForecast(base([])).questions).toBe(0);
    const f = buildScoreForecast(base([quiz('a', 50)]));
    expect(f.confidence).toBe('few');
    expect(f.high - f.low).toBeGreaterThanOrEqual(20);
    expect(f.mid).toBe(40);
  });

  it('shrinks a handful of perfect answers instead of promising a high score', () => {
    const a = quiz('a', 50);
    const f = buildScoreForecast(base([a], statsFor(a, 3, 1, 0)));
    expect(f.confidence).toBe('few');
    expect(f.mid).toBeLessThan(50);
    expect(f.high).toBeGreaterThan(f.mid);
  });

  it('narrows the range as more distinct questions are answered', () => {
    const a = quiz('a', 100);
    const few = buildScoreForecast(base([a], statsFor(a, 10, 3, 1)));
    const many = buildScoreForecast(base([a], statsFor(a, 100, 3, 1)));
    expect(many.high - many.low).toBeLessThan(few.high - few.low);
  });

  it('is monotonic: better accuracy and more coverage never lower the forecast', () => {
    const a = quiz('a', 60);
    const worse = buildScoreForecast(base([a], statsFor(a, 40, 1, 2)));
    const better = buildScoreForecast(base([a], statsFor(a, 40, 3, 0)));
    expect(better.mid).toBeGreaterThan(worse.mid);
    const wider = buildScoreForecast(base([a], statsFor(a, 55, 3, 0)));
    expect(wider.mid).toBeGreaterThanOrEqual(better.mid);
  });

  it('lowers the forecast for overdue SM-2 items, more so the later they are', () => {
    const a = quiz('a', 40);
    const fresh = buildScoreForecast(base([a], statsFor(a, 40, 3, 0)));
    const due = buildScoreForecast(base([a], statsFor(a, 40, 3, 0, { nextReview: NOW - 2 * DAY })));
    const veryDue = buildScoreForecast(base([a], statsFor(a, 40, 3, 0, { nextReview: NOW - 30 * DAY })));
    expect(due.mid).toBeLessThan(fresh.mid);
    expect(veryDue.mid).toBeLessThan(due.mid);
    expect(due.due).toBe(40);
    expect(fresh.due).toBe(0);
  });

  it('ignores retired history, archived, derived, flashcard and combined sets', () => {
    const a = quiz('a', 30);
    const baseStats = statsFor(a, 30, 3, 0);
    const retired = Object.fromEntries(Object.entries(baseStats).map(([k, v]) => [k, { ...v, retired: true }]));
    expect(buildScoreForecast(base([a], retired)).answered).toBe(0);

    const noise = [
      quiz('arch', 20, { archived: true }),
      quiz('mist', 20, { tags: ['mistake-bank'] }),
      quiz('cards', 20, { kind: 'flashcard' }),
      quiz('mix-x', 20, { tags: ['folder-session:x'] }),
    ];
    const f = buildScoreForecast(base([a, ...noise]));
    expect(f.questions).toBe(30);
  });

  it('counts a question once when it sits in two sets (same id) or has the same text', () => {
    const a = quiz('a', 10);
    const copy = { ...quiz('b', 0), questions: a.questions } as Quiz;
    const textTwin = { ...quiz('c', 0), questions: a.questions.map((q) => ({ ...q, id: `${q.id}-twin` })) } as Quiz;
    const stats = { ...statsFor(a, 10, 1, 0), ...statsFor(copy, 10, 1, 0) };
    const f = buildScoreForecast(base([a, copy, textTwin], stats));
    expect(f.questions).toBe(10);
    expect(f.answered).toBe(10);
  });

  it('groups by Rezidențiat discipline and specialty folders, else by category', () => {
    const folders = [
      { id: 'r', name: 'Rezidențiat', parentId: null },
      { id: 'd', name: 'Cardiologie', parentId: 'r' },
      { id: 's1', name: 'Aritmii', parentId: 'd' },
      { id: 's2', name: 'Valvulopatii', parentId: 'd' },
    ];
    const f = buildScoreForecast(base(
      [quiz('a', 10, { folderId: 's1' }), quiz('b', 10, { folderId: 's2' }), quiz('c', 10, { category: 'Anatomie' })],
      {}, { folders },
    ));
    expect(f.disciplines.map((d) => d.name).sort()).toEqual(['Anatomie', 'Cardiologie']);
    const cardio = f.disciplines.find((d) => d.name === 'Cardiologie')!;
    expect(cardio.units.map((u) => u.label).sort()).toEqual(['Aritmii', 'Valvulopatii']);
  });

  it('ranks the chapters that lift the forecast most, biggest unseen backlog first, with a quiz to open', () => {
    const big = quiz('big', 80, { category: 'Mare' });
    const small = quiz('small', 10, { category: 'Mic' });
    const done = quiz('done', 30, { category: 'Gata' });
    const f = buildScoreForecast(base([big, small, done], statsFor(done, 30, 5, 0)));
    expect(f.top).toHaveLength(3);
    expect(f.top[0].label).toBe('Mare');
    expect(f.top[0].quizId).toBe('big');
    expect(f.top[0].lift).toBeGreaterThan(f.top[1].lift);
    expect(f.top.map((u) => u.lift)).toEqual([...f.top.map((u) => u.lift)].sort((a, b) => b - a));
  });

  it('uses the sessions for a trend only with enough questions in both windows', () => {
    const a = quiz('a', 40);
    const session = (daysAgo: number, score: number, total: number): QuizSession => ({
      id: `${daysAgo}-${score}`, quizId: 'a', startedAt: NOW - daysAgo * DAY, finishedAt: NOW - daysAgo * DAY, score, total,
    } as QuizSession);
    const stats = statsFor(a, 40, 2, 1);
    const none = buildScoreForecast(base([a], stats, { sessions: [session(2, 18, 20)] }));
    expect(none.trend).toBeNull();
    const up = buildScoreForecast(base([a], stats, { sessions: [session(2, 18, 20), session(20, 10, 20)] }));
    expect(up.trend).toBe(40);
    const flat = buildScoreForecast(base([a], stats, { sessions: [session(2, 10, 20), session(20, 10, 20)] }));
    expect(up.mid).toBeGreaterThan(flat.mid);
  });

  it('gives a net score range for 200 questions that follows the accuracy range', () => {
    const a = quiz('a', 100);
    const f = buildScoreForecast(base([a], statsFor(a, 100, 4, 1)));
    expect(f.net.low).toBeLessThan(f.net.mid);
    expect(f.net.mid).toBeLessThan(f.net.high);
    expect(f.net.mid).toBe(Math.round(netScore(f.mid)));
  });
});
