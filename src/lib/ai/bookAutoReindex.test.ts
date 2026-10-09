import { describe, expect, it } from 'vitest';
import { BOOK_FILES } from '../bookPages';
import { findDuplicateSources, planAutoReindex } from './bookAutoReindex';

const src = (id: string, name: string, chunkCount = 100) => ({ id, name, chunkCount });

describe('planAutoReindex', () => {
  it('mapează cărțile cunoscute la fișierele lor compilate', () => {
    const plan = planAutoReindex([
      src('1', 'Kumar și Clark – Medicină Clinică'),
      src('2', 'Lawrence – Chirurgie generală și specialități chirurgicale'),
      src('3', 'Sinopsis de medicină'),
    ]);
    expect(plan.manual).toEqual([]);
    expect(plan.auto.map((t) => t.relPath)).toEqual([BOOK_FILES.K, BOOK_FILES.L, BOOK_FILES.S]);
  });

  it('lasă pentru selector sursele necunoscute', () => {
    const plan = planAutoReindex([src('1', 'Curs anatomie.pdf'), src('2', 'Kumar.pdf')]);
    expect(plan.auto).toHaveLength(1);
    expect(plan.manual.map((s) => s.id)).toEqual(['1']);
  });
});

describe('findDuplicateSources', () => {
  it('găsește aceeași carte indexată de două ori (cazul Lawrence)', () => {
    const groups = findDuplicateSources([
      src('k', 'Kumar și Clark – Medicină Clinică', 1811),
      src('l1', 'Lawrence – Chirurgie generală și specialități chirurgicale', 1488),
      src('l2', 'Lawrence – Chirurgie generală și specialități chirurgicale', 1488),
      src('s', 'Sinopsis de medicină', 352),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe('l1');
    expect(groups[0].extra.map((s) => s.id)).toEqual(['l2']);
  });

  it('nu consideră dublură aceeași denumire cu alt număr de fragmente', () => {
    expect(findDuplicateSources([src('a', 'Lawrence', 1000), src('b', 'Lawrence', 1488)])).toEqual([]);
  });
});
