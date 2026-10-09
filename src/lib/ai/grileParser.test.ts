import { describe, it, expect } from 'vitest';
import { parseGrile, type SourceLine } from './grileParser';

function lines(...texts: Array<string | [string, boolean]>): SourceLine[] {
  return texts.map((t) => (Array.isArray(t) ? { text: t[0], bold: t[1] } : { text: t }));
}

describe('grileParser template diversification sanity checks', () => {
  it('parses labeled question numbering ("Întrebarea N:")', () => {
    const { questions } = parseGrile(lines(
      'Întrebarea 1: Care este cauza cea mai frecventă?',
      'a) Virală',
      'b) Bacteriană',
      'Răspuns corect: b',
      'Întrebarea 2: Alt enunt?',
      'a) Da',
      'b) Nu',
      'Raspuns: a',
    ));
    expect(questions).toHaveLength(2);
    expect(questions[0].options[1].isCorrect).toBe(true);
  });

  it('parses dash-numbered questions ("3 - stem")', () => {
    const { questions } = parseGrile(lines(
      '3 - Care e diagnosticul?',
      'a - Cancer',
      'b - Chist',
      'Cheie: a',
    ));
    expect(questions).toHaveLength(1);
    expect(questions[0].options[0].isCorrect).toBe(true);
  });

  it('parses parenthesized option letters "(a) text"', () => {
    const { questions } = parseGrile(lines(
      '1. Stem cu paranteze?',
      '(a) prima varianta',
      '(b) a doua varianta',
      'Varianta corecta: b',
    ));
    expect(questions).toHaveLength(1);
    expect(questions[0].options[1].isCorrect).toBe(true);
  });

  it('recognizes "select one or more" as a multiple-answer marker instead of skipping it', () => {
    const { questions } = parseGrile(lines(
      '1. Stem moodle?',
      'Select one or more:',
      'a) opt1',
      'b) opt2',
      'Answer: a, b',
    ));
    expect(questions).toHaveLength(1);
    expect(questions[0].multipleCorrect).toBe(true);
    expect(questions[0].options[0].isCorrect).toBe(true);
    expect(questions[0].options[1].isCorrect).toBe(true);
  });

  it('still parses classic numbered + lettered format (regression check)', () => {
    const { questions } = parseGrile(lines(
      '1. Ce reprezinta simptomul X?',
      'a. varianta unu',
      'b. varianta doi',
      'c. varianta trei',
      'Raspuns corect: c',
    ));
    expect(questions).toHaveLength(1);
    expect(questions[0].options[2].isCorrect).toBe(true);
    expect(questions[0].confidence).toBe('high');
  });

  it('still parses bold-format-based answer (docx, no numbering)', () => {
    const { questions } = parseGrile([
      { text: 'Stem fara numerotare:', bold: true },
      { text: 'a) gresit' },
      { text: 'b) corect', bold: true },
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].options[1].isCorrect).toBe(true);
    expect(questions[0].answerSource).toBe('format');
  });

  // Reproduces the exact layout of a real file the user uploaded
  // (Grile_Dermatologie_FINAL.pdf) that produced 8 garbled options instead of
  // 5: a leading "✓" glyph on correct options broke LETTER_OPTION_RE, the
  // bare "CM — N răspunsuri corecte" caption line became a bogus option, and
  // the wrapped "Din curs: ..." explanation box became two more bogus options.
  it('parses the real Grile_Dermatologie_FINAL.pdf question 1 layout correctly', () => {
    const { questions } = parseGrile(lines(
      '1. Clinic, urticaria se manifestă prin:',
      'CM — 4 răspunsuri corecte',
      '✓ a) Placard edematos',
      'b) Placard acoperit de scuame',
      '✓ c) Placard pruriginos',
      '✓ d) Placard cu caracter fugace',
      '✓ e) Placard eritematos',
      "Din curs: Curs 6 (Urticaria): eruptie formata din papule si placi eritemato-edematoase, fugace,",
      "pruriginoase. Toate cele 4 caracteristici (edem, prurit, caracter fugace, eritem) sunt corecte; doar",
      "'acoperit de scuame' nu apartine urticariei.",
      '2. Terbinafină este un medicament:',
      'CS — răspuns unic',
      '✓ a) Antimicotic',
      'b) Antibacterian',
      "Din curs: Curs 4 (Tratament tinea): Terbinafina este listata la clasa Alilamine, antimicotic.",
    ));
    expect(questions).toHaveLength(2);

    const q1 = questions[0];
    expect(q1.options).toHaveLength(5);
    expect(q1.multipleCorrect).toBe(true);
    expect(q1.options.map((o) => o.isCorrect)).toEqual([true, false, true, true, true]);
    expect(q1.options.every((o) => !/[✓]|din curs/i.test(o.text))).toBe(true);

    const q2 = questions[1];
    expect(q2.options).toHaveLength(2);
    expect(q2.multipleCorrect).toBe(false);
    expect(q2.options[0].isCorrect).toBe(true);
  });

  it('ignores "nemarcat în sursă" and "Nota: ..." boxes instead of treating them as options', () => {
    const { questions } = parseGrile(lines(
      '181. Funcia melanocitelor include:',
      'nemarcat în sursă',
      'a) Protecție împotriva deshidratării',
      'b) Protecție împotriva substanțelor toxice',
      'c) Protecție mecanică',
      'd) Protecție împotriva radiațiilor UV',
      'Nota: [NEVERIFICAT/INCOMPLET] Gasita doar in 1.docx/2.pdf, cu 4 variante si fara raspuns',
      'marcat. Enuntul original pare sa se refere la functiile generale de bariera ale pielii.',
      '182. Alt enunt care urmeaza:',
      'a) Da',
      'b) Nu',
      'Raspuns: a',
    ));
    expect(questions).toHaveLength(2);
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].options.every((o) => !/nemarcat|nota/i.test(o.text))).toBe(true);
    expect(questions[1].options).toHaveLength(2);
    expect(questions[1].options[0].isCorrect).toBe(true);
  });
});

describe('grileParser specialty header detection', () => {
  it('tags questions with the nearest preceding ALL-CAPS section header', () => {
    const { questions } = parseGrile(lines(
      'CARDIOLOGIE',
      '1.Starea de rau, pierderea cunostintei',
      'a) stenoza aortica stransa',
      'b) hipotensiunea arteriala',
      'Raspuns corect b',
      'PULMONAR',
      '2.Astmul bronsic',
      'a) varianta unu',
      'b) varianta doi',
      'Raspuns corect a',
    ));
    expect(questions).toHaveLength(2);
    expect(questions[0].specialty).toBe('CARDIOLOGIE');
    expect(questions[1].specialty).toBe('PULMONAR');
  });

  it('leaves specialty undefined when no section headers are present', () => {
    const { questions } = parseGrile(lines(
      '1. O intrebare simpla?',
      'a) una',
      'b) doua',
      'Raspuns corect a',
    ));
    expect(questions).toHaveLength(1);
    expect(questions[0].specialty).toBeUndefined();
  });

  it('does not swallow a section header as a bogus trailing option', () => {
    const { questions } = parseGrile(lines(
      '1. Prima intrebare?',
      'a) una',
      'b) doua',
      'Raspuns corect a',
      'REUMATOLOGIE',
      '2. A doua intrebare?',
      'a) trei',
      'b) patru',
      'Raspuns corect b',
    ));
    expect(questions).toHaveLength(2);
    expect(questions[0].options).toHaveLength(2);
    expect(questions[1].specialty).toBe('REUMATOLOGIE');
  });
});
