import { describe, expect, it, vi } from 'vitest';

vi.mock('./bookText', () => ({ bundledBookText: async (code: string) => `text curat ${code}` }));

import { findOutdatedBundledBooks, REZIDENTIAT_LIBRARY_BOOKS } from './rezidentiatLibrary';

describe('findOutdatedBundledBooks', () => {
  const kumar = REZIDENTIAT_LIBRARY_BOOKS[0];
  const sinopsis = REZIDENTIAT_LIBRARY_BOOKS[2];

  it('găsește cărțile al căror index nu are lungimea textului curat', async () => {
    const found = await findOutdatedBundledBooks([
      { id: 'a', name: kumar.name, charCount: 999, indexStatus: 'ready' },
      { id: 'b', name: sinopsis.name, charCount: 'text curat S'.length, indexStatus: 'ready' },
    ]);
    expect(found.map((item) => item.sourceId)).toEqual(['a']);
  });

  it('ignoră cărțile neimportate, în indexare sau cu eroare', async () => {
    const found = await findOutdatedBundledBooks([
      { id: 'a', name: kumar.name, charCount: 1, indexStatus: 'indexing' },
      { id: 'b', name: sinopsis.name, charCount: 1, indexStatus: 'error' },
    ]);
    expect(found).toEqual([]);
  });
});
