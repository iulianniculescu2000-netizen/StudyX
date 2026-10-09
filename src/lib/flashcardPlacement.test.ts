import { describe, expect, it } from 'vitest';
import type { Folder } from '../types';
import { suggestFlashcardFolder } from './flashcardPlacement';

const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  emoji: '📁',
  color: 'blue',
  createdAt: 0,
  parentId,
});

describe('suggestFlashcardFolder', () => {
  const folders = [
    folder('a', 'Balneofizioterapie'),
    folder('b', 'Chirurgie'),
    folder('c', 'Chirurgie generală'),
    folder('r', 'Rezidențiat'),
    folder('rc', 'Cardiologie', 'r'),
    folder('x', 'Ex'),
  ];

  it('finds a folder named in the course file name, ignoring case, diacritics and extension', () => {
    expect(suggestFlashcardFolder('Curs BALNEOFIZIOTERAPIE 2024.pdf', folders)?.id).toBe('a');
    expect(suggestFlashcardFolder('balneofizioterapie .pdf', folders)?.id).toBe('a');
  });

  it('prefers the most specific folder', () => {
    expect(suggestFlashcardFolder('Chirurgie generala - curs 3.pdf', folders)?.id).toBe('c');
    expect(suggestFlashcardFolder('Chirurgie - curs 3.pdf', folders)?.id).toBe('b');
  });

  it('matches only whole words', () => {
    expect(suggestFlashcardFolder('Hiperchirurgie.pdf', folders)).toBeNull();
  });

  it('never suggests a folder inside the Rezidențiat tree', () => {
    expect(suggestFlashcardFolder('Cardiologie curs.pdf', folders)).toBeNull();
  });

  it('returns null for unrelated, empty or very short names', () => {
    expect(suggestFlashcardFolder('Farmacologie.pdf', folders)).toBeNull();
    expect(suggestFlashcardFolder('', folders)).toBeNull();
    expect(suggestFlashcardFolder('Ex.pdf', folders)).toBeNull();
  });
});
