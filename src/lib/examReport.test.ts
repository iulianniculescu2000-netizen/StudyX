import { describe, expect, it } from 'vitest';
import type { Question, Quiz, QuizSession } from '../types';
import { chapterBreakdown, compareWithPrevious, examTotals, kindBreakdown, paceEstimate, previousSimulations, questionPoints } from './examReport';
import { buildExamSimulation, examSourceKey, splitCsCm } from './examSimulation';

const q = (id: string, correct: string[], chapter = 'Cap 1', extra: Partial<Question> = {}): Question => ({
  id,
  text: `Intrebare ${id}`,
  options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: o, isCorrect: correct.includes(o) })),
  tags: [`chap:${chapter}`, 'disc:Cardio'],
  ...extra,
});

describe('scorare', () => {
  it('+1 corect complet, −0,25 per opțiune greșită, 0 fără răspuns', () => {
    const cm = q('x', ['a', 'b']);
    expect(questionPoints(cm, ['a', 'b'])).toBe(1);
    expect(questionPoints(cm, ['a'])).toBe(0);
    expect(questionPoints(cm, ['a', 'c'])).toBe(-0.25);
    expect(questionPoints(cm, ['c', 'd'])).toBe(-0.5);
    expect(questionPoints(cm, [])).toBe(0);
  });

  it('totaluri: nete cu minim 0, nerăspunsele nu sunt greșite', () => {
    const qs = [q('1', ['a']), q('2', ['a']), q('3', ['a']), q('4', ['a'])];
    const t = examTotals(qs, { '1': ['a'], '2': ['b'], '3': [] });
    expect(t).toMatchObject({ total: 4, answered: 2, correct: 1, wrong: 1, unanswered: 2, net: 0.75, percent: 19 });
    expect(examTotals(qs, { '1': ['b'], '2': ['b'] }).net).toBe(0);
  });
});

describe('agregare', () => {
  const qs = [q('1', ['a'], 'Aritmii'), q('2', ['a'], 'Aritmii'), q('3', ['a', 'b'], 'Valvulopatii'), q('4', ['a'], 'Valvulopatii')];
  const answers = { '1': ['a'], '2': ['b'], '3': ['a', 'b'], '4': ['a'] };

  it('pe capitole, cele mai slabe întâi', () => {
    const rows = chapterBreakdown(qs, answers);
    expect(rows.map((r) => r.label)).toEqual(['Aritmii', 'Valvulopatii']);
    expect(rows[0]).toMatchObject({ total: 2, correct: 1, net: 0.75, accuracy: 50 });
    expect(rows[1]).toMatchObject({ correct: 2, accuracy: 100 });
  });

  it('capitolul fără niciun răspuns ajunge la urmă, cu acuratețe necunoscută', () => {
    const rows = chapterBreakdown(qs, { '3': ['a', 'b'] });
    expect(rows[rows.length - 1]).toMatchObject({ label: 'Aritmii', answered: 0, accuracy: null });
  });

  it('CS față de CM', () => {
    const rows = kindBreakdown(qs, answers);
    expect(rows.map((r) => [r.label, r.total])).toEqual([['CM', 1], ['CS', 3]]);
  });
});

describe('comparație cu simulările anterioare', () => {
  const sim = { id: 'sim', tags: ['exam-simulation'] } as unknown as Quiz;
  const other = { id: 'o', tags: [] } as unknown as Quiz;
  const s = (id: string, quizId: string, at: number, net: number): QuizSession =>
    ({ id, quizId, finishedAt: at, startedAt: at - 10, total: 100, score: 0, penalizedScore: net, answers: {}, mode: 'exam' }) as QuizSession;

  it('ia doar simulările terminate, fără cea curentă, cele mai noi întâi', () => {
    const prev = previousSimulations([sim, other], [s('a', 'sim', 100, 40), s('b', 'sim', 200, 60), s('c', 'o', 300, 99), s('cur', 'sim', 400, 70)], 'cur');
    expect(prev.map((p) => p.sessionId)).toEqual(['b', 'a']);
    const cmp = compareWithPrevious(70, prev)!;
    expect(cmp).toMatchObject({ average: 50, delta: 20, deltaLast: 10 });
    expect(compareWithPrevious(70, [])).toBeNull();
  });
});

describe('estimare din ritm', () => {
  const many = Array.from({ length: 40 }, (_, i) => q(String(i), ['a']));

  it('nu estimează cu prea puține răspunsuri sau când s-a răspuns la toate', () => {
    expect(paceEstimate(many, Object.fromEntries(many.slice(0, 5).map((x) => [x.id, ['a']])), 600)).toBeNull();
    expect(paceEstimate(many, Object.fromEntries(many.map((x) => [x.id, ['a']])), 600)).toBeNull();
  });

  it('extinde media pe nerăspunse, cu interval care conține valoarea de mijloc și rămâne în [0, total]', () => {
    const answers = Object.fromEntries(many.slice(0, 20).map((x, i) => [x.id, [i % 4 === 0 ? 'b' : 'a']]));
    const est = paceEstimate(many, answers, 1200)!;
    expect(est.answered).toBe(20);
    expect(est.unanswered).toBe(20);
    // 15 corecte, 5 greșite cu −0,25 → net 13,75; media 0,6875 → mijloc 27,5
    expect(est.mid).toBeCloseTo(27.5, 1);
    expect(est.low).toBeLessThan(est.mid);
    expect(est.high).toBeGreaterThan(est.mid);
    expect(est.low).toBeGreaterThanOrEqual(0);
    expect(est.high).toBeLessThanOrEqual(40);
    expect(est.secondsPerQuestion).toBe(60);
  });
});

describe('construirea simulării', () => {
  it('splitCsCm: ~25% CS, completează cu celălalt tip când lipsește', () => {
    expect(splitCsCm(200, 1000, 1000)).toEqual({ cs: 50, cm: 150 });
    expect(splitCsCm(200, 10, 1000)).toEqual({ cs: 10, cm: 190 });
    expect(splitCsCm(200, 1000, 20)).toEqual({ cs: 180, cm: 20 });
    expect(splitCsCm(40, 5, 5)).toEqual({ cs: 5, cm: 5 });
  });

  it('păstrează raportul CS/CM, capitolul și sursa pe copii', () => {
    const quiz = {
      id: 'src1', title: 'Cap Aritmii', category: 'Cardiologie', kind: 'quiz',
      questions: Array.from({ length: 80 }, (_, i) => q(`q${i}`, i % 2 === 0 ? ['a'] : ['a', 'b'], 'x', { text: `Text unic ${i}`, tags: [] })),
    } as unknown as Quiz;
    const sim = buildExamSimulation([quiz], 40, { random: () => 0.5 })!;
    const kinds = kindBreakdown(sim.quiz.questions, {});
    expect(kinds.find((k) => k.label === 'CS')?.total).toBe(10);
    expect(kinds.find((k) => k.label === 'CM')?.total).toBe(30);
    const first = sim.quiz.questions[0];
    expect(first.tags).toContain('chap:Cap Aritmii');
    expect(examSourceKey(first)).toMatchObject({ quizId: 'src1' });
    expect(examSourceKey({ tags: [] })).toBeNull();
  });
});
