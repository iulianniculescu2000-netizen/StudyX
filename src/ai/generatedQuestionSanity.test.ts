/**
 * Quality gate for AI-generated questions.
 *
 * Anything that survives this ends up saved as a real quiz the user studies, so
 * an unanswerable or self-contradictory question is worse than no question.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeGeneratedQuestions } from './AIEngine';
import type { Question } from '../types';

function q(partial: Partial<Question>): Question {
  return {
    id: 'x',
    text: 'Care este cauza cea mai frecventă a X?',
    options: [
      { id: 'a', text: 'Prima', isCorrect: true },
      { id: 'b', text: 'A doua', isCorrect: false },
    ],
    multipleCorrect: false,
    ...partial,
  };
}

describe('sanitizeGeneratedQuestions', () => {
  it('keeps a well-formed question untouched', () => {
    const result = sanitizeGeneratedQuestions([q({})]);
    expect(result).toHaveLength(1);
    expect(result[0].options).toHaveLength(2);
  });

  it('drops a question with no correct option (unanswerable)', () => {
    const result = sanitizeGeneratedQuestions([q({
      options: [
        { id: 'a', text: 'Prima', isCorrect: false },
        { id: 'b', text: 'A doua', isCorrect: false },
      ],
    })]);
    expect(result).toEqual([]);
  });

  it('drops a question with an empty stem', () => {
    expect(sanitizeGeneratedQuestions([q({ text: '   ' })])).toEqual([]);
  });

  it('removes duplicate option texts rather than showing the same answer twice', () => {
    const result = sanitizeGeneratedQuestions([q({
      options: [
        { id: 'a', text: 'Infarct miocardic', isCorrect: true },
        { id: 'b', text: 'infarct  miocardic', isCorrect: true },
        { id: 'c', text: 'Pericardită', isCorrect: false },
      ],
    })]);
    expect(result).toHaveLength(1);
    expect(result[0].options.map((o) => o.text)).toEqual(['Infarct miocardic', 'Pericardită']);
    expect(result[0].multipleCorrect).toBe(false);
  });

  it('drops empty option texts', () => {
    const result = sanitizeGeneratedQuestions([q({
      options: [
        { id: 'a', text: 'Prima', isCorrect: true },
        { id: 'b', text: '', isCorrect: false },
        { id: 'c', text: 'A treia', isCorrect: false },
      ],
    })]);
    expect(result[0].options).toHaveLength(2);
  });

  it('drops a question left with fewer than two options after de-duplication', () => {
    const result = sanitizeGeneratedQuestions([q({
      options: [
        { id: 'a', text: 'Aceeași', isCorrect: true },
        { id: 'b', text: 'aceeasi', isCorrect: false },
      ],
    })]);
    expect(result).toEqual([]);
  });

  it('recomputes multipleCorrect from the surviving options', () => {
    const result = sanitizeGeneratedQuestions([q({
      multipleCorrect: false,
      options: [
        { id: 'a', text: 'Prima', isCorrect: true },
        { id: 'b', text: 'A doua', isCorrect: true },
        { id: 'c', text: 'A treia', isCorrect: false },
      ],
    })]);
    expect(result[0].multipleCorrect).toBe(true);
  });
});
