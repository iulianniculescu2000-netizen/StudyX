/**
 * Gate on AI-generated questions before they are saved as real quizzes.
 *
 * Two directions matter equally: nothing broken may pass, and nothing good may
 * be thrown away. The second is the sneakier failure — a silently discarded
 * question just looks like the AI generated fewer than you asked for.
 */
import { describe, expect, it } from 'vitest';
import { isValidQuestion, type GeneratedQuestion } from './groq';

function q(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    text: 'Care este cauza cea mai frecventă a infarctului?',
    options: [
      { text: 'Ateroscleroza coronariană', isCorrect: true },
      { text: 'Embolie pulmonară', isCorrect: false },
      { text: 'Pericardită acută', isCorrect: false },
    ],
    ...overrides,
  } as GeneratedQuestion;
}

describe('good questions must survive', () => {
  it('accepts a well-formed question', () => {
    expect(isValidQuestion(q())).toBe(true);
  });

  // Regression: a plain substring test on "format" deleted ordinary Romanian.
  it('keeps a stem containing the Romanian word "format"', () => {
    expect(isValidQuestion(q({ text: 'Din ce este format nefronul?' }))).toBe(true);
  });

  it('keeps a stem about the formation of a structure', () => {
    expect(isValidQuestion(q({ text: 'Cum este formatul septului interventricular?' }))).toBe(true);
  });
});

describe('instruction leakage must still be rejected', () => {
  it('rejects a stem that is about the JSON output format', () => {
    expect(isValidQuestion(q({ text: 'Returnează răspunsul în format JSON valid.' }))).toBe(false);
  });

  it('rejects a stem mentioning JSON at all', () => {
    expect(isValidQuestion(q({ text: 'Care este structura JSON cerută?' }))).toBe(false);
  });
});

describe('broken questions must be rejected', () => {
  it('rejects an empty distractor', () => {
    expect(isValidQuestion(q({
      options: [
        { text: 'Ateroscleroza coronariană', isCorrect: true },
        { text: '   ', isCorrect: false },
        { text: 'Pericardită acută', isCorrect: false },
      ],
    }))).toBe(false);
  });

  it('rejects two identical distractors', () => {
    expect(isValidQuestion(q({
      options: [
        { text: 'Ateroscleroza coronariană', isCorrect: true },
        { text: 'Embolie pulmonară', isCorrect: false },
        { text: 'embolie pulmonara', isCorrect: false },
      ],
    }))).toBe(false);
  });

  it('rejects a distractor that copies the correct answer', () => {
    expect(isValidQuestion(q({
      options: [
        { text: 'Ateroscleroza coronariană', isCorrect: true },
        { text: 'Ateroscleroza coronariana', isCorrect: false },
      ],
    }))).toBe(false);
  });

  it('rejects a question with no correct option', () => {
    expect(isValidQuestion(q({
      options: [
        { text: 'Prima', isCorrect: false },
        { text: 'A doua', isCorrect: false },
      ],
    }))).toBe(false);
  });

  it('rejects a question with several correct options', () => {
    expect(isValidQuestion(q({
      options: [
        { text: 'Prima', isCorrect: true },
        { text: 'A doua', isCorrect: true },
      ],
    }))).toBe(false);
  });

  it('rejects an empty stem', () => {
    expect(isValidQuestion(q({ text: '  ' }))).toBe(false);
  });
});
