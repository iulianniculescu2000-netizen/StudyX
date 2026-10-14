import { describe, expect, it } from 'vitest';
import { groupByTier, sourceTier, TIER_RANK } from './bookTier';
import { REZIDENTIAT_LIBRARY_BOOKS } from './rezidentiatLibrary';
import type { AILibraryFolder } from '../store/aiStore';

const folders: AILibraryFolder[] = [
  { id: 'rez', name: 'Rezidențiat', emoji: '🩺', parentId: null, createdAt: 1 },
  { id: 'rez-cap', name: 'Capitole', emoji: '📚', parentId: 'rez', createdAt: 2 },
  { id: 'gen', name: 'Facultate', emoji: '🎓', parentId: null, createdAt: 3 },
];

describe('nivelul surselor (carte de bază / material / bibliotecă)', () => {
  it('o carte inclusă e „carte” oriunde ar sta, chiar și în afara Rezidențiatului', () => {
    const name = REZIDENTIAT_LIBRARY_BOOKS[0].name;
    expect(sourceTier({ name, folderId: 'rez' }, folders)).toBe('book');
    expect(sourceTier({ name, folderId: 'gen' }, folders)).toBe('book');
    expect(sourceTier({ name, folderId: null }, folders)).toBe('book');
  });

  it('un document din Rezidențiat (și din subfolderele lui) e „material”, unul din afară e „bibliotecă”', () => {
    expect(sourceTier({ name: 'Cardiologie.pdf', folderId: 'rez' }, folders)).toBe('bank');
    expect(sourceTier({ name: 'Cardiologie.pdf', folderId: 'rez-cap' }, folders)).toBe('bank');
    expect(sourceTier({ name: 'Curs.pdf', folderId: 'gen' }, folders)).toBe('general');
    expect(sourceTier({ name: 'Curs.pdf', folderId: null }, folders)).toBe('general');
  });

  it('grupează pe niveluri păstrând ordinea, iar cărțile au cel mai mic rang', () => {
    const sources = [
      { name: 'Note.pdf', folderId: 'rez' },
      { name: REZIDENTIAT_LIBRARY_BOOKS[1].name, folderId: 'rez' },
      { name: 'Curs.pdf', folderId: null },
      { name: 'Alte note.pdf', folderId: 'rez-cap' },
    ];
    const grouped = groupByTier(sources, folders);
    expect(grouped.book.map((s) => s.name)).toEqual([REZIDENTIAT_LIBRARY_BOOKS[1].name]);
    expect(grouped.bank.map((s) => s.name)).toEqual(['Note.pdf', 'Alte note.pdf']);
    expect(grouped.general.map((s) => s.name)).toEqual(['Curs.pdf']);
    expect(TIER_RANK.book).toBeLessThan(TIER_RANK.bank);
    expect(TIER_RANK.bank).toBeLessThan(TIER_RANK.general);
  });
});
