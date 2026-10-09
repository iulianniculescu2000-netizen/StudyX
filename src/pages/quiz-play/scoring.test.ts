import { describe, expect, it } from 'vitest';
import { penalizedScore, scoreAnswers } from './scoring';
import type { Question } from '../../types';

const q = (id: string, correct: string[], all = ['a', 'b', 'c', 'd']): Question => ({
  id,
  text: id,
  options: all.map((o) => ({ id: o, text: o, isCorrect: correct.includes(o) })),
});

describe('scoreAnswers', () => {
  it('counts fully correct and lists partial answers', () => {
    const qs = [q('1', ['a']), q('2', ['a', 'b']), q('3', ['a', 'b']), q('4', ['a'])];
    const res = scoreAnswers(qs, { 1: ['a'], 2: ['a'], 3: ['a', 'c'], 4: [] });
    expect(res).toEqual({ score: 1, partialAnswerIds: ['2'] });
  });

  it('treats missing answers as unanswered', () => {
    expect(scoreAnswers([q('1', ['a'])], {})).toEqual({ score: 0, partialAnswerIds: [] });
  });
});

describe('penalizedScore', () => {
  it('+1 per correct, -0.25 per wrong option', () => {
    const qs = [q('1', ['a']), q('2', ['a'])];
    expect(penalizedScore(qs, { 1: ['a'], 2: ['b', 'c'] })).toBe(0.5);
  });

  it('a wrong pick inside an otherwise partial answer still costs 0.25 each', () => {
    const qs = [q('1', ['a', 'b']), q('2', ['a'])];
    expect(penalizedScore(qs, { 1: ['a', 'c'], 2: ['a'] })).toBe(0.75);
  });

  it('missed-only partial answers cost nothing', () => {
    expect(penalizedScore([q('1', ['a', 'b'])], { 1: ['a'] })).toBe(0);
  });

  it('unanswered is neutral and the total is clamped at 0', () => {
    const qs = [q('1', ['a']), q('2', ['a'])];
    expect(penalizedScore(qs, { 1: [] })).toBe(0);
    expect(penalizedScore(qs, { 1: ['b', 'c', 'd'], 2: ['b'] })).toBe(0);
  });

  it('rounds to two decimals', () => {
    const qs = [q('1', ['a']), q('2', ['a']), q('3', ['a'])];
    expect(penalizedScore(qs, { 1: ['a'], 2: ['a'], 3: ['b'] })).toBe(1.75);
  });
});
