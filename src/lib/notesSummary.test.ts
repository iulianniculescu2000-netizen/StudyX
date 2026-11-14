import { describe, expect, it } from 'vitest';
import { notesSummary } from './notesSummary';

describe('subtitlul paginii Notițe', () => {
  it('numără notițele pe grile și schemele separat', () => {
    expect(notesSummary(3, 2, 0)).toBe('3 notițe din 2 grile');
    expect(notesSummary(1, 1, 2)).toBe('1 notiță din 1 grilă · 2 scheme');
  });
  it('doar scheme: nu mai apare „1 notiță din 1 grilă”', () => {
    expect(notesSummary(0, 0, 1)).toBe('1 schemă');
  });
});
