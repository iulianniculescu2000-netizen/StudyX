import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeSearchText } from './searchText';

describe('searchText', () => {
  it('scoate diacriticele și majusculele', () => {
    expect(normalizeSearchText('Știință ȘȚ ŞŢ ăâî')).toBe('stiinta st st aai');
  });
  it('potrivește fără diacritice în ambele sensuri', () => {
    expect(matchesQuery('Anestezie', 'anestezie')).toBe(true);
    expect(matchesQuery('anestezie', 'Anestezie')).toBe(true);
    expect(matchesQuery('Sarcină', 'sarcina')).toBe(true);
    expect(matchesQuery('sarcina', 'sarcină')).toBe(true);
    expect(matchesQuery('știință', 'stiinta')).toBe(true);
    expect(matchesQuery('stiinta', 'știință')).toBe(true);
  });
  it('cere toate cuvintele', () => {
    expect(matchesQuery('Boli infecțioase la copil', 'copil infectioase')).toBe(true);
    expect(matchesQuery('Boli infecțioase', 'copil infectioase')).toBe(false);
    expect(matchesQuery('orice', '   ')).toBe(true);
  });
});
