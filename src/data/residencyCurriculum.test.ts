import { describe, it, expect } from 'vitest';
import { matchBookByName } from './residencyCurriculum';

describe('matchBookByName', () => {
  it('matches known books by filename, case/diacritics-insensitive', () => {
    expect(matchBookByName('kumar-doar-capitolele-rezi.pdf')?.title).toContain('Kumar');
    expect(matchBookByName('LAWRENCE.pdf')?.title).toContain('Lawrence');
    expect(matchBookByName('Sinopsis.pdf')?.title).toContain('Sinopsis');
  });

  it('returns null for unrelated documents', () => {
    expect(matchBookByName('unrelated-document.pdf')).toBeNull();
  });
});
