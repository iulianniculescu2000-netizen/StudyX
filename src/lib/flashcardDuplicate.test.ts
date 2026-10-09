import { describe, expect, it } from 'vitest';
import { isDuplicateFlashcard } from './groq';

describe('isDuplicateFlashcard', () => {
  it('flags the same front written with other case, diacritics or punctuation', () => {
    expect(isDuplicateFlashcard('Ce este diabetul zaharat?', ['ce ESTE diabetul zaharat'])).toBe(true);
    expect(isDuplicateFlashcard('Tratamentul șocului septic', ['Tratamentul socului septic'])).toBe(true);
  });

  it('does not treat a short front contained in a longer one as a repeat', () => {
    expect(isDuplicateFlashcard('HTA', ['Tratamentul HTA'])).toBe(false);
    expect(isDuplicateFlashcard('Tratamentul HTA', ['HTA'])).toBe(false);
  });

  it('keeps apart fronts that differ only by a number', () => {
    expect(isDuplicateFlashcard('Ce este MEN2?', ['Ce este MEN1?'])).toBe(false);
    expect(isDuplicateFlashcard('Tratamentul în stadiul 3', ['Tratamentul în stadiul 2'])).toBe(false);
  });

  it('still catches a near-identical long front', () => {
    expect(isDuplicateFlashcard(
      'Care sunt criteriile de diagnostic pentru sindromul nefrotic la adult?',
      ['Care sunt criteriile de diagnostic ale sindromului nefrotic la adult?'],
    )).toBe(true);
  });

  it('treats an empty front as a duplicate so it is dropped', () => {
    expect(isDuplicateFlashcard('   ', [])).toBe(true);
  });
});
