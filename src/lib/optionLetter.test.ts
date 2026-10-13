import { describe, expect, it } from 'vitest';
import { optionLetter } from './optionLetter';

describe('optionLetter', () => {
  it('dă litera după poziție', () => {
    expect([0, 1, 2, 3, 4].map(optionLetter)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('trece pe numere după Z și nu strică pe poziții invalide', () => {
    expect(optionLetter(25)).toBe('Z');
    expect(optionLetter(26)).toBe('27');
    expect(optionLetter(-1)).toBe('0');
  });
});
