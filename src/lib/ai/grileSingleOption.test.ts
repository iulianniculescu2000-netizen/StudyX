import { describe, expect, it } from 'vitest';
import { parseGrile } from './grileParser';

const lines = (t: string) => t.split('\n').map((text) => ({ text }));

describe('grile cu o singură variantă', () => {
  it('rămâne de verificat și avertismentul numește cheia', () => {
    const { questions, stats } = parseGrile(lines('1. Care este capitala Franței?\na) Paris\nRaspuns: a'));
    expect(questions).toHaveLength(1);
    expect(questions[0].confidence).toBe('low');
    expect(questions[0].options.some((o) => o.isCorrect)).toBe(false);
    expect(questions[0].warnings[0]).toMatch(/cheia indică „a"/);
    expect(stats.needsReview).toBe(1);
    expect(stats.incomplete).toBe(1);
  });
});
