import { describe, expect, it } from 'vitest';
import type { Question, QuestionStat, Quiz, QuizSession } from '../types';
import {
  avgSecondsPerQuestion, buildCrunchQuiz, collectCrunchPool, crunchOptions, DEFAULT_SECONDS_PER_QUESTION,
  questionsForMinutes, selectCrunch, shouldShowCrunch,
} from './examCrunch';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const q = (id: string, text = `Întrebarea ${id}`): Question => ({
  id, text, options: [{ id: 'a', text: `răspuns ${id}`, isCorrect: true }, { id: 'b', text: 'altul', isCorrect: false }],
});
const quiz = (id: string, questions: Question[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: `Set ${id}`, description: '', emoji: '', category: '', kind: 'quiz', questions, createdAt: 0, color: 'blue', ...extra,
});
const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview: NOW + DAY, interval: 1, ...extra,
});
const key = (s: QuestionStat) => `${s.quizId}:${s.questionId}`;
const statsOf = (...list: QuestionStat[]) => Object.fromEntries(list.map((s) => [key(s), s]));

describe('collectCrunchPool', () => {
  const quizzes = [
    quiz('a', [q('due1'), q('due2'), q('bad1'), q('ok1'), q('new1'), q('new2')]),
    quiz('b', [q('n1'), q('n2'), q('n3'), q('s1')]),
  ];
  const stats = statsOf(
    stat('a', 'due1', { nextReview: NOW - 5 * DAY }),
    stat('a', 'due2', { nextReview: NOW - 1 * DAY }),
    stat('a', 'bad1', { timesWrong: 3, timesCorrect: 1 }),
    stat('a', 'ok1', { timesCorrect: 5 }),
    stat('b', 's1', { timesCorrect: 1 }),
  );

  it('împarte în scadente, greșite și lacune, cele mai urgente primele', () => {
    const pool = collectCrunchPool(quizzes, stats, NOW);
    expect(pool.due.map((c) => c.question.id)).toEqual(['due1', 'due2']);
    expect(pool.missed.map((c) => c.question.id)).toEqual(['bad1']);
    // Setul b (1/4 văzut) e mai puțin acoperit decât a (4/6): primul în round-robin.
    expect(pool.gaps.map((c) => c.question.id)).toEqual(['n1', 'new1', 'n2', 'new2', 'n3']);
    expect(pool.gaps.map((c) => c.question.id)).not.toContain('ok1');
  });

  it('nu pune aceeași întrebare în două găleți și deduplică seturile cu conținut identic', () => {
    const dup = [...quizzes, quiz('copy', [{ ...q('due1'), id: 'x' }, { ...q('n1'), id: 'x2' }])];
    const copyStats = { ...stats, ...statsOf(stat('copy', 'x', { timesWrong: 4 })) };
    const pool = collectCrunchPool(dup, copyStats, NOW);
    const ids = [...pool.due, ...pool.missed, ...pool.gaps].map((c) => c.question.text);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pool.due.map((c) => c.question.id)).toContain('due1');
  });

  it('ignoră întrebările retrase, flashcardurile, sesiunile combinate, arhivatele și seturile generate', () => {
    const noisy = [
      ...quizzes,
      quiz('cards', [q('c1')], { kind: 'flashcard' }),
      quiz('mix-a', [q('due1')], { tags: ['folder-session:a'] }),
      quiz('old', [q('o1')], { archived: true }),
      quiz('gen', [q('g1')], { tags: ['recovery', 'crunch'] }),
    ];
    const withRetired = { ...stats, ...statsOf(stat('a', 'bad1', { timesWrong: 3, retired: true }), stat('gen', 'g1', { nextReview: NOW - DAY })) };
    const pool = collectCrunchPool(noisy, withRetired, NOW);
    const all = [...pool.due, ...pool.missed, ...pool.gaps].map((c) => c.question.id);
    expect(all).not.toContain('bad1');
    for (const id of ['c1', 'o1', 'g1']) expect(all).not.toContain(id);
    expect(all.filter((id) => id === 'due1')).toHaveLength(1);
  });

  it('adună statisticile setului real cu ale sesiunii combinate', () => {
    const withMix = [...quizzes, quiz('mix-a', [q('ok1')], { tags: ['folder-session:a'] })];
    const merged = { ...stats, ...statsOf(stat('mix-a', 'ok1', { timesWrong: 2, timesCorrect: 0 })) };
    expect(collectCrunchPool(withMix, merged, NOW).missed.map((c) => c.question.id)).toContain('ok1');
  });

  it('un set bine acoperit nu produce lacune', () => {
    const covered = [quiz('c', [q('1'), q('2'), q('3'), q('4')])];
    const pool = collectCrunchPool(covered, statsOf(stat('c', '1'), stat('c', '2'), stat('c', '3')), NOW);
    expect(pool.gaps).toEqual([]);
  });
});

describe('selectCrunch', () => {
  const pool = collectCrunchPool(
    [quiz('a', Array.from({ length: 40 }, (_, i) => q(`d${i}`)))],
    statsOf(...Array.from({ length: 40 }, (_, i) => stat('a', `d${i}`, { nextReview: NOW - DAY }))),
    NOW,
  );

  it('respectă bugetul și nu depășește ce există', () => {
    expect(selectCrunch(pool, 10).items).toHaveLength(10);
    expect(selectCrunch(pool, 999).items).toHaveLength(40);
  });

  it('dă prioritate scadentelor și lasă cotele nefolosite următoarelor găleți', () => {
    const mixed = collectCrunchPool(
      [quiz('a', [q('d1'), q('d2'), q('m1'), q('m2'), q('m3'), q('g1'), q('g2'), q('g3')]), quiz('b', [q('x1'), q('x2')])],
      statsOf(
        stat('a', 'd1', { nextReview: NOW - DAY }), stat('a', 'd2', { nextReview: NOW - DAY }),
        stat('a', 'm1', { timesWrong: 3 }), stat('a', 'm2', { timesWrong: 2 }), stat('a', 'm3', { timesWrong: 2 }),
      ),
      NOW,
    );
    const ten = selectCrunch(mixed, 10);
    expect(ten.counts).toEqual({ due: 2, missed: 3, gaps: 5 });
    const four = selectCrunch(mixed, 4);
    expect(four.counts.due).toBe(2);
    expect(four.counts.due + four.counts.missed + four.counts.gaps).toBe(4);
    expect(four.counts.missed).toBeGreaterThanOrEqual(1);
  });
});

describe('timp și sesiune', () => {
  const session = (times: number[]): QuizSession => ({
    id: 's', quizId: 'a', answers: {}, startedAt: 0, score: 0, total: times.length, mode: 'study',
    timePerQuestion: Object.fromEntries(times.map((t, i) => [`q${i}`, t])),
  });

  it('folosește mediana din istoric, cu valoare implicită când sunt prea puține date', () => {
    expect(avgSecondsPerQuestion([])).toBe(DEFAULT_SECONDS_PER_QUESTION);
    expect(avgSecondsPerQuestion([session([20, 20, 20])])).toBe(DEFAULT_SECONDS_PER_QUESTION);
    expect(avgSecondsPerQuestion([session(Array(30).fill(30))])).toBe(30);
    expect(avgSecondsPerQuestion([session([...Array(25).fill(5), 400])])).toBe(15);
  });

  it('transformă minutele în număr de întrebări', () => {
    expect(questionsForMinutes(30, 45)).toBe(40);
    expect(questionsForMinutes(15, 60)).toBe(15);
  });

  it('opțiunile 15/30/60 cresc și se opresc la ce există', () => {
    const pool = collectCrunchPool([quiz('a', Array.from({ length: 50 }, (_, i) => q(`n${i}`)))], {}, NOW);
    const options = crunchOptions(pool, 45);
    expect(options.map((o) => o.minutes)).toEqual([15, 30, 60]);
    expect(options.map((o) => o.size)).toEqual([20, 40, 50]);
  });

  it('construiește un set marcat generat (recovery + crunch), fără dubluri, în buget', () => {
    const pool = collectCrunchPool([quiz('a', Array.from({ length: 50 }, (_, i) => q(`n${i}`)))], {}, NOW);
    const built = buildCrunchQuiz(pool, 15, 45, NOW)!;
    expect(built.tags).toEqual(['recovery', 'crunch']);
    expect(built.questions).toHaveLength(20);
    expect(new Set(built.questions.map((x) => x.id)).size).toBe(20);
    expect(built.id).toBe('crunch-session');
    expect(buildCrunchQuiz({ due: [], missed: [], gaps: [] }, 15, 45)).toBeNull();
  });
});

describe('shouldShowCrunch', () => {
  it('apare la ≤ 30 de zile, înainte de examen, sau când e activat', () => {
    expect(shouldShowCrunch(30, false, false)).toBe(true);
    expect(shouldShowCrunch(31, false, false)).toBe(false);
    expect(shouldShowCrunch(10, true, false)).toBe(false);
    expect(shouldShowCrunch(null, false, false)).toBe(false);
    expect(shouldShowCrunch(200, false, true)).toBe(true);
  });
});
