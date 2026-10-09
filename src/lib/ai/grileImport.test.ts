import { describe, it, expect } from 'vitest';
import { parseGrile, type SourceLine } from './grileParser';
import { toQuizImportDataBySpecialty } from './grileImport';

function lines(...texts: string[]): SourceLine[] {
  return texts.map((t) => ({ text: t }));
}

describe('toQuizImportDataBySpecialty', () => {
  it('splits questions into one quiz per detected specialty', () => {
    const { questions } = parseGrile(lines(
      'CARDIOLOGIE',
      '1.Intrebare cardio?',
      'a) una',
      'b) doua',
      'Raspuns corect a',
      'PULMONAR',
      '2.Intrebare pulmonar?',
      'a) trei',
      'b) patru',
      'Raspuns corect b',
    ));

    const groups = toQuizImportDataBySpecialty('Banca de grile', questions);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe('Banca de grile · CARDIOLOGIE');
    expect(groups[0].questions).toHaveLength(1);
    expect(groups[1].title).toBe('Banca de grile · PULMONAR');
    expect(groups[1].questions).toHaveLength(1);
  });

  it('falls back to a single quiz when no specialties are detected', () => {
    const { questions } = parseGrile(lines(
      '1. O intrebare simpla?',
      'a) una',
      'b) doua',
      'Raspuns corect a',
    ));

    const groups = toQuizImportDataBySpecialty('Banca de grile', questions);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Banca de grile');
    expect(groups[0].questions).toHaveLength(1);
  });
});
