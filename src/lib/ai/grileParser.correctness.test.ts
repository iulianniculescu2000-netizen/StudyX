/**
 * Correctness regression tests for the grile extractor.
 *
 * These all guard the same failure mode, which is the worst one this parser has:
 * producing a question that looks perfectly fine but has the WRONG option marked
 * correct. A question that fails to parse is visible and fixable in the review
 * screen; a confidently mis-keyed one teaches the wrong medicine.
 */
import { describe, expect, it } from 'vitest';
import { parseGrile, type SourceLine } from './grileParser';

function lines(...texts: Array<string | [string, boolean]>): SourceLine[] {
  return texts.map((t) => (Array.isArray(t) ? { text: t[0], bold: t[1] } : { text: t }));
}

function correctTexts(q: { options: Array<{ text: string; isCorrect: boolean }> }) {
  return q.options.filter((o) => o.isCorrect).map((o) => o.text);
}

describe('options wrapped across lines', () => {
  it('joins a wrapped option instead of inventing a phantom one', () => {
    const { questions } = parseGrile(lines(
      '1. Care este tratamentul de primă intenție?',
      'a) Penicilină administrată timp de',
      'zece zile consecutive',
      'b) Eritromicină',
      'c) Cefalosporină',
      'Raspuns corect: c',
    ));

    expect(questions).toHaveLength(1);
    // The wrap must not become a 4th option — that is what shifts every letter.
    expect(questions[0].options).toHaveLength(3);
    expect(questions[0].options[0].text).toBe('Penicilină administrată timp de zece zile consecutive');
    expect(correctTexts(questions[0])).toEqual(['Cefalosporină']);
  });

  it('still treats bare lines as separate options when the bank uses no letters', () => {
    const { questions } = parseGrile(lines(
      ['Pacientul prezintă febră:', true],
      'Prima varianta',
      ['A doua varianta', true],
      'A treia varianta',
    ));

    expect(questions[0].options).toHaveLength(3);
    expect(correctTexts(questions[0])).toEqual(['A doua varianta']);
  });
});

describe('the answer key is resolved by printed letter', () => {
  it('marks the option actually labelled "d" when letter c is missing', () => {
    const { questions } = parseGrile(lines(
      '1. Enunt cu o litera sarita?',
      'a) prima',
      'b) a doua',
      'd) a patra',
      'e) a cincea',
      'Raspuns corect: d',
    ));

    expect(correctTexts(questions[0])).toEqual(['a patra']);
  });

  it('is not fooled by a duplicated option letter', () => {
    const { questions } = parseGrile(lines(
      '1. Enunt cu litera duplicata?',
      'a) prima',
      'a) prima bis',
      'b) a doua',
      'Raspuns corect: b',
    ));

    expect(correctTexts(questions[0])).toEqual(['a doua']);
  });

  it('still works positionally for unlettered dash lists', () => {
    const { questions } = parseGrile(lines(
      '1. Enunt cu liniute?',
      '- prima',
      '- a doua',
      '- a treia',
      'Raspuns corect: b',
    ));

    expect(correctTexts(questions[0])).toEqual(['a doua']);
  });
});

describe('answer-key separators', () => {
  it('accepts "a si c" written without diacritics', () => {
    const { questions } = parseGrile(lines(
      '1. Enunt cu doua raspunsuri?',
      'a) unu',
      'b) doi',
      'c) trei',
      'Raspuns corect: a si c',
    ));

    // The key line must not survive as a bogus fourth option.
    expect(questions[0].options).toHaveLength(3);
    expect(questions[0].answerSource).toBe('explicit');
    expect(correctTexts(questions[0])).toEqual(['unu', 'trei']);
  });

  it('still accepts the diacritic spelling "a și c"', () => {
    const { questions } = parseGrile(lines(
      '1. Enunt cu doua raspunsuri?',
      'a) unu',
      'b) doi',
      'c) trei',
      'Raspuns corect: a și c',
    ));

    expect(correctTexts(questions[0])).toEqual(['unu', 'trei']);
  });
});

describe('explanation boxes must not swallow the answer key', () => {
  it('honours a key printed after a "Din curs:" note', () => {
    const { questions } = parseGrile(lines(
      '1. Care este diagnosticul?',
      'a) Unu',
      'b) Doi',
      'Din curs: Curs 3, pagina 12, paragraful despre etiologie.',
      'Raspuns corect: b',
    ));

    expect(questions[0].answerSource).toBe('explicit');
    expect(correctTexts(questions[0])).toEqual(['Doi']);
  });

  it('still drops the explanation prose itself', () => {
    const { questions } = parseGrile(lines(
      '1. Care este diagnosticul?',
      'a) Unu',
      'b) Doi',
      'Din curs: Curs 3, pagina 12.',
      'Continuarea explicatiei pe randul urmator.',
      'Raspuns corect: b',
    ));

    expect(questions[0].options).toHaveLength(2);
  });
});

describe('ALL-CAPS lines', () => {
  it('does not eat an acronym option as a specialty header', () => {
    const { questions } = parseGrile(lines(
      'CARDIOLOGIE',
      '1. Care este agentul etiologic?',
      'a) HIV',
      'BCG',
      'c) Streptococ',
      'Raspuns corect: c',
      '2. A doua intrebare?',
      'a) Da',
      'b) Nu',
      'Raspuns corect: a',
    ));

    // "BCG" wraps option a); it must not vanish, and must not rename the section.
    expect(questions[0].specialty).toBe('CARDIOLOGIE');
    expect(questions[1].specialty).toBe('CARDIOLOGIE');
    expect(correctTexts(questions[0])).toEqual(['Streptococ']);
  });

  it('still recognises a real specialty header before a question', () => {
    const { questions } = parseGrile(lines(
      'CARDIOLOGIE',
      '1. Prima intrebare?',
      'a) Unu',
      'b) Doi',
      'Raspuns corect: a',
      'PNEUMOLOGIE',
      '2. A doua intrebare?',
      'a) Trei',
      'b) Patru',
      'Raspuns corect: b',
    ));

    expect(questions[0].specialty).toBe('CARDIOLOGIE');
    expect(questions[1].specialty).toBe('PNEUMOLOGIE');
  });
});

describe('"DA -" correctness prefix', () => {
  it('does not truncate a legitimate option that starts with "Da -"', () => {
    const { questions } = parseGrile(lines(
      ['Pacientul are febra la internare:', true],
      'Da - a fost masurata 39 grade',
      'Nu - afebril',
    ));

    expect(questions[0].options[0].text).toBe('Da - a fost masurata 39 grade');
    expect(questions[0].options[0].isCorrect).toBe(false);
  });

  it('still uses "DA -" as a correctness marker before a real option letter', () => {
    const { questions } = parseGrile(lines(
      '1. Care varianta e corecta?',
      'DA - a) Placard edematos',
      'b) Altceva',
    ));

    expect(correctTexts(questions[0])).toEqual(['Placard edematos']);
  });
});

describe('contradictions in the key', () => {
  it('never reports single-choice while marking two options correct', () => {
    const { questions } = parseGrile(lines(
      '1. Enunt complement simplu? (CS)',
      'a) unu',
      'b) doi',
      'c) trei',
      'Raspuns corect: a, b',
    ));

    const q = questions[0];
    expect(correctTexts(q)).toEqual(['unu', 'doi']);
    // Either it is multi-answer, or the contradiction is surfaced — never a
    // silently unanswerable single-choice question.
    expect(q.multipleCorrect).toBe(true);
    expect(q.warnings.length).toBeGreaterThan(0);
  });

  it('warns distinctly when the key names a letter that does not exist', () => {
    const { questions } = parseGrile(lines(
      '1. Enunt cu cheie gresita?',
      'a) unu',
      'b) doi',
      'Raspuns corect: e',
    ));

    const q = questions[0];
    expect(q.answerSource).toBe('none');
    // "unmarked" is misleading: it WAS marked, with a letter that isn't there.
    expect(q.warnings.join(' ')).not.toMatch(/nemarcat/i);
    expect(q.warnings.join(' ')).toMatch(/e/i);
  });
});

describe('page numbers survive preprocessing', () => {
  it('keeps the page of a split option label so images can still attach', () => {
    const { questions } = parseGrile([
      { text: '1. Ce arata imaginea?', page: 3 },
      { text: 'A.', page: 4 },
      { text: 'Prima varianta', page: 4 },
      { text: 'B.', page: 4 },
      { text: 'A doua varianta', page: 4 },
    ]);

    expect(questions[0].pages).toEqual([3, 4]);
  });
});
