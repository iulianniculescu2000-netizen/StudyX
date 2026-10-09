import { describe, expect, it } from 'vitest';
import { daysUntil, describeStudyPlan } from './organizare';
import type { PlanSummary } from './organizare/types';

const summary: PlanSummary = {
  ts: 0,
  exam: '2027-11-21',
  phase: 1,
  done: 12,
  total: 555,
  pct: 3,
  streak: 4,
  today: { n: 'Fibrilația atrială', g: 'Cardiologie', src: 'Kumar p.220-223', pages: 3 },
};

describe('daysUntil', () => {
  it('counts whole days and never goes below zero', () => {
    expect(daysUntil('2027-11-21', new Date(2027, 10, 20, 23, 59))).toBe(1);
    expect(daysUntil('2027-11-21', new Date(2027, 10, 21, 8))).toBe(0);
    expect(daysUntil('2027-11-21', new Date(2028, 0, 5))).toBe(0);
  });
});

describe('describeStudyPlan', () => {
  it('summarises the pass, the current topic and the countdown', () => {
    const text = describeStudyPlan(summary, new Date(2027, 10, 11));
    expect(text).toContain('trecerea 1 din 4');
    expect(text).toContain('12 din 555');
    expect(text).toContain('Fibrilația atrială (Kumar p.220-223)');
    expect(text).toContain('peste 10 zile');
    expect(text).toContain('Serie de studiu: 4 zile');
  });

  it('names the current curriculum chapter and how much of it is done', () => {
    const text = describeStudyPlan({ ...summary, chapter: { index: 10, done: 2, total: 5 } }, new Date(2027, 10, 11));
    expect(text).toContain('Capitolul curent: 11. Cardiologie');
    expect(text).toContain('Kumar');
    expect(text).toContain('2 din 5 topicuri gata');
    expect(describeStudyPlan(summary, new Date(2027, 10, 11))).not.toContain('Capitolul curent');
    expect(describeStudyPlan({ ...summary, chapter: { index: 99, done: 0, total: 1 } }, new Date(2027, 10, 11))).not.toContain('Capitolul curent');
  });

  it('is empty without a plan, and describes the simulation stage without a pass number', () => {
    expect(describeStudyPlan(null, new Date())).toBe('');
    expect(describeStudyPlan({ ...summary, phase: 5, today: null, streak: 0 }, new Date(2027, 10, 11)))
      .toBe('Planul de rezidențiat: etapa de simulări și menținere. Examenul este peste 10 zile.');
  });
});
