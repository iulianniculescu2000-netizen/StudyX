import { describe, expect, it } from 'vitest';
import { citedSources, dropUnknownCitations, withoutCitations } from './explanationCitations';
import type { ContextSource } from './contextBuilder';

const source = (n: number, page: number): ContextSource => ({
  n, id: `c${n}`, source: 'Kumar', page, label: `Kumar, p. ${page}`, excerpt: '', tier: 'book',
});
const SOURCES = [source(1, 75), source(2, 76), source(3, 120)];

describe('citările din explicația unei grile', () => {
  it('arată doar sursele al căror [n] apare în text', () => {
    const text = '**✅ De ce e corect:** metotrexatul este tratamentul de fond [1]. Monitorizăm hemograma [3].';
    expect(citedSources(text, SOURCES).map((s) => s.page)).toEqual([75, 120]);
  });

  it('fără nicio etichetă nu arată nicio sursă, chiar dacă fragmentele au fost trimise', () => {
    expect(citedSources('Explicație din cunoștințe generale.', SOURCES)).toEqual([]);
  });

  it('extinde intervalele și listele', () => {
    expect(citedSources('Vezi [1-2] și [2, 3].', SOURCES).map((s) => s.n)).toEqual([1, 2, 3]);
  });

  it('scoate etichetele care nu trimit la o sursă existentă și le păstrează pe cele valide', () => {
    const cleaned = dropUnknownCitations('Corect [1]. Inventat [7]. Amestec [2, 9].', SOURCES);
    expect(cleaned).toBe('Corect [1]. Inventat. Amestec.');
    expect(citedSources(cleaned, SOURCES).map((s) => s.n)).toEqual([1]);
  });

  it('textul pentru banca de greșeli nu are etichete', () => {
    expect(withoutCitations('Corect [1]. Și [2, 3].')).toBe('Corect. Și.');
  });
});
