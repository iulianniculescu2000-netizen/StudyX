import { describe, expect, it } from 'vitest';
import { plural, pluralWord } from './plural';

describe('plural', () => {
  it('singular only for exactly 1', () => {
    expect(plural(1, 'grilă', 'grile')).toBe('1 grilă');
    expect(plural(0, 'grilă', 'grile')).toBe('0 grile');
    expect(plural(2, 'grilă', 'grile')).toBe('2 grile');
    expect(plural(19, 'grilă', 'grile')).toBe('19 grile');
  });
  it('adds „de” from 20 up, except hundreds-and-teens', () => {
    expect(plural(20, 'grilă', 'grile')).toBe('20 de grile');
    expect(plural(101, 'sesiune', 'sesiuni')).toBe('101 sesiuni');
    expect(plural(119, 'sesiune', 'sesiuni')).toBe('119 sesiuni');
    expect(plural(100, 'sesiune', 'sesiuni')).toBe('100 de sesiuni');
    expect(plural(121, 'sesiune', 'sesiuni')).toBe('121 de sesiuni');
  });
  it('formats large numbers in the Romanian locale', () => {
    expect(plural(1234, 'întrebare', 'întrebări').replace(/\s/g, ' ')).toMatch(/^1\.234 de întrebări$/);
  });
  it('pluralWord picks the word only', () => {
    expect(pluralWord(1, 'set', 'seturi')).toBe('set');
    expect(pluralWord(3, 'set', 'seturi')).toBe('seturi');
  });
});
