import { describe, expect, it } from 'vitest';
import { matchFilesToSources, plainFileName } from './reindexMatch';

describe('matchFilesToSources', () => {
  it('matches by normalized name, one file per source', () => {
    const sources = [{ id: 1, name: 'Kumar și Clark.pdf' }, { id: 2, name: 'Harrison.pdf' }];
    const files = [{ name: 'harrison.PDF' }, { name: 'Kumar si Clark.pdf' }, { name: 'Altceva.pdf' }, { name: 'Harrison.pdf' }];
    const res = matchFilesToSources(files, sources);
    expect(res.pairs.map((p) => p.source.id).sort()).toEqual([1, 2]);
    expect(res.unmatchedFiles.map((f) => f.name)).toEqual(['Altceva.pdf', 'Harrison.pdf']);
    expect(res.unmatchedSources).toEqual([]);
  });
  it('reports sources with no file', () => {
    const res = matchFilesToSources([], [{ name: 'A.pdf' }]);
    expect(res.unmatchedSources).toHaveLength(1);
  });
  it('normalizes diacritics and punctuation', () => {
    expect(plainFileName('Pediatrie_Ș_1.pdf')).toBe('pediatrie s 1');
  });
});
