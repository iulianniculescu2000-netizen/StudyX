import { describe, expect, it } from 'vitest';
import plan from '../../data/organizare/plan.json';
import weights from '../../data/organizare/examWeights.json';
import { describeExamWeight, examWeightOf, topExamTopics } from './examWeights';

const topics = plan.ch.map((c, index) => ({ index, src: c.src }));

describe('ponderi „ce pică”', () => {
  it('fiecare pondere se leagă de o temă existentă, cu aceeași sursă', () => {
    for (const [key, src] of Object.entries(weights.src)) expect(plan.ch[Number(key)].src).toBe(src);
  });

  it('acoperă aproape toate cele 1200 de grile', () => {
    const total = Object.values(weights.w).reduce((s, e) => s + e.n, 0);
    expect(total).toBeGreaterThan(1150);
    expect(total).toBeLessThanOrEqual(1200);
  });

  it('refuză o pondere când tema nu mai corespunde planului', () => {
    const first = topics.find((t) => examWeightOf(t))!;
    expect(examWeightOf({ index: first.index, src: 'Altă carte p.1' })).toBeNull();
  });

  it('formulează clar și sortează descrescător', () => {
    expect(describeExamWeight(null)).toBe('nu a picat în 2021–2025');
    expect(describeExamWeight({ questions: 1, years: 1, hotPages: 0 })).toBe('1 grilă în 2021–2025, într-un an');
    const top = topExamTopics(topics, 3).map((t) => examWeightOf(t)!.questions);
    expect(top[0]).toBeGreaterThanOrEqual(top[1]);
    expect(top[1]).toBeGreaterThanOrEqual(top[2]);
  });
});
