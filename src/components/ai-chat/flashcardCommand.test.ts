import { describe, expect, it } from 'vitest';
import { detectDifficultyInText } from '../../lib/ai/optionRequest';

describe('flashcard chat command difficulty', () => {
  it.each([
    ['fă-mi 20 flashcarduri ușoare din cursul de cardiologie', 'easy'],
    ['fă-mi 20 flashcarduri grele din cursul de cardiologie', 'hard'],
    ['generează 10 flashcarduri nivel mediu din documentul meu', 'medium'],
    ['fă-mi 12 flashcarduri din cursul de cardiologie', null],
  ])('%s -> %s', (text, expected) => {
    expect(detectDifficultyInText(text)).toBe(expected);
  });
});
