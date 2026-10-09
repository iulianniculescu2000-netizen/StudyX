import { describe, expect, it } from 'vitest';
import type { Question } from '../types';
import { mergeBuiltInDeck } from './rezidentiatFlashcards';

const card = (id: string, text = id): Question => ({
  id, text, multipleCorrect: false, options: [{ id: `${id}-a`, text: 'r', isCorrect: true }],
});

describe('mergeBuiltInDeck', () => {
  it('takes corrected content and order from the bundled deck', () => {
    const merged = mergeBuiltInDeck([card('a', 'vechi'), card('b')], [card('b'), card('a', 'corectat')], () => false);
    expect(merged.map((q) => q.id)).toEqual(['b', 'a']);
    expect(merged[1].text).toBe('corectat');
  });

  it('keeps a dropped card that has study history, at the end', () => {
    const merged = mergeBuiltInDeck([card('old'), card('a')], [card('a'), card('new')], (id) => id === 'old');
    expect(merged.map((q) => q.id)).toEqual(['a', 'new', 'old']);
  });

  it('drops a removed card nobody has studied', () => {
    const merged = mergeBuiltInDeck([card('old'), card('a')], [card('a')], () => false);
    expect(merged.map((q) => q.id)).toEqual(['a']);
  });

  it('adds new bundled cards to an existing deck', () => {
    expect(mergeBuiltInDeck([card('a')], [card('a'), card('b')], () => false)).toHaveLength(2);
  });
});
