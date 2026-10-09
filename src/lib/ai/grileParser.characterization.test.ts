import { describe, expect, it } from 'vitest';
import { normalizeText, parseGrile, type SourceLine } from './grileParser';

const L = (...texts: Array<string | [string, Partial<SourceLine>]>): SourceLine[] =>
  texts.map((t) => (Array.isArray(t) ? { text: t[0], ...t[1] } : { text: t }));
const view = (r: ReturnType<typeof parseGrile>) =>
  r.questions.map((q) => [q.text, q.options.map((o) => (o.isCorrect ? '*' : '') + o.text)]);

describe('normalizeText', () => {
  it('strips Romanian diacritics (comma and cedilla forms), case and punctuation', () => {
    expect(normalizeText('Ștefan ȚĂRANU, Îngrijire — sindrom?')).toBe('stefan taranu ingrijire sindrom');
    expect(normalizeText('ş ţ ș ț ă â î')).toBe('s t s t a a i');
    expect(normalizeText('  a  b ')).toBe('a b');
  });
});

describe('realistic residency formats', () => {
  it('parses a CM question with a "a, c și e" key and diacritics', () => {
    const r = parseGrile(L(
      '12. Sunt cauze de insuficiență cardiacă cu fracție de ejecție redusă: (CM)',
      'a) Cardiomiopatia ischemică',
      'b) Stenoza mitrală izolată',
      'c) Cardiomiopatia dilatativă',
      'd) Pericardita constrictivă',
      'e) Hipertensiunea arterială severă',
      'Răspuns corect: a, c și e',
    ));
    expect(r.questions).toHaveLength(1);
    const q = r.questions[0];
    expect(q.text).toBe('Sunt cauze de insuficiență cardiacă cu fracție de ejecție redusă:');
    expect(q.multipleCorrect).toBe(true);
    expect(q.answerSource).toBe('explicit');
    expect(q.options.map((o) => o.isCorrect)).toEqual([true, false, true, false, true]);
    expect(r.stats).toMatchObject({ total: 1, withAnswer: 1, highConfidence: 1, needsReview: 0 });
  });

  it('reads the answer from bold/marked formatting and flags the unmarked ones', () => {
    const r = parseGrile(L(
      '1. Cel mai frecvent agent al pneumoniei comunitare este:',
      ['a) Streptococcus pneumoniae', { bold: true }],
      'b) Klebsiella pneumoniae',
      '2. Tratamentul de elecție în sifilisul primar este:',
      'a) Penicilina G benzatinică',
      ['b) Doxiciclina', { marked: true }],
      '3. Întrebare fără cheie despre HTA?',
      'a) Una',
      'b) Alta',
    ));
    expect(view(r)).toEqual([
      ['Cel mai frecvent agent al pneumoniei comunitare este:', ['*Streptococcus pneumoniae', 'Klebsiella pneumoniae']],
      ['Tratamentul de elecție în sifilisul primar este:', ['Penicilina G benzatinică', '*Doxiciclina']],
      ['Întrebare fără cheie despre HTA?', ['Una', 'Alta']],
    ]);
    expect(r.questions.map((q) => q.answerSource)).toEqual(['format', 'format', 'none']);
    expect(r.questions[2].warnings).toEqual(['Răspuns nemarcat — de verificat.']);
    expect(r.stats).toMatchObject({ total: 3, withAnswer: 2, highConfidence: 2, needsReview: 1 });
  });

  it('accepts a checkmark prefix, non-breaking spaces and a Moodle text key with diacritics', () => {
    const r = parseGrile(L(
      '1. Care este tratamentul pneumotoraxului hipertensiv?',
      'a) Observație',
      '✓ b) Decompresie imediată cu ac',
      '2. Ce reprezintă nevralgia trigeminală?',
      'a) Durere paroxistică',
      'b) Cefalee tensională',
      'The correct answer is: Durere paroxistică',
      '3. Alt exemplu clinic dificil?',
      'a) Pătrunjel',
      'b) Țelină',
      'Răspunsul corect este: țelina',
    ));
    expect(view(r)).toEqual([
      ['Care este tratamentul pneumotoraxului hipertensiv?', ['Observație', '*Decompresie imediată cu ac']],
      ['Ce reprezintă nevralgia trigeminală?', ['*Durere paroxistică', 'Cefalee tensională']],
      ['Alt exemplu clinic dificil?', ['Pătrunjel', '*Țelină']],
    ]);
  });

  it('strips a trailing [CM]/(CS) tag from the stem and uses it as the type', () => {
    const r = parseGrile(L(
      '5. Complicațiile diabetului zaharat includ: [CM]',
      'a) Nefropatia',
      'b) Retinopatia',
      'c) Hepatita A',
      'Răspuns: a, b',
      '6. Cea mai frecventă cauză de pancreatită acută este: (CS)',
      'a) Litiaza biliară',
      'b) Alcoolul',
      'Răspuns: a',
    ));
    expect(r.questions.map((q) => q.text)).toEqual([
      'Complicațiile diabetului zaharat includ:',
      'Cea mai frecventă cauză de pancreatită acută este:',
    ]);
    expect(r.questions.map((q) => q.multipleCorrect)).toEqual([true, false]);
  });
});

describe('numbers inside wrapped text are not question numbers (bug fix)', () => {
  it('keeps a decimal-led wrapped option line inside its question', () => {
    const r = parseGrile(L(
      '1. Care este valoarea normală a glicemiei à jeun la adult, exprimată în mmol/L?',
      'a) sub',
      '3.9 mmol/L',
      'b) între 3.9 și 5.6 mmol/L',
      'c) peste 7 mmol/L',
      'Răspuns corect: b',
    ));
    expect(view(r)).toEqual([[
      'Care este valoarea normală a glicemiei à jeun la adult, exprimată în mmol/L?',
      ['sub 3.9 mmol/L', '*între 3.9 și 5.6 mmol/L', 'peste 7 mmol/L'],
    ]]);
  });

  it('keeps a range-led wrapped line ("120 - 140 mmHg") inside its question', () => {
    const r = parseGrile(L(
      '2. Ce interval are TA normală?',
      'a) 120 - 140 mmHg',
      'b) mai mult',
      '120 - 140 mmHg pentru vârstnici',
      'Răspuns: a',
    ));
    expect(view(r)).toEqual([['Ce interval are TA normală?', ['*120 - 140 mmHg', 'mai mult 120 - 140 mmHg pentru vârstnici']]]);
  });

  it('still reads "3 - stem" and "12.Stem" as question starts', () => {
    const r = parseGrile(L(
      '3 - Care e diagnosticul?', 'a - Cancer', 'b - Chist', 'Cheie: a',
      '12.Care e tratamentul?', 'a) Chirurgical', 'b) Conservator', 'Răspuns: b',
    ));
    expect(r.questions.map((q) => q.text)).toEqual(['Care e diagnosticul?', 'Care e tratamentul?']);
  });
});

describe('large inputs', () => {
  it('parses 5000 five-option questions exactly and in reasonable time', () => {
    const lines: SourceLine[] = [];
    for (let i = 1; i <= 5000; i += 1) {
      lines.push({ text: `${(i % 999) + 1}. Care este diagnosticul pentru cazul ${i} în sindromul nefrotic? (CM)` });
      for (const c of 'abcde') lines.push({ text: `${c}) Varianta ${c} ștefan țară ${i}`, bold: c === 'b' || c === 'd' });
    }
    const start = Date.now();
    const r = parseGrile(lines);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(r.stats).toMatchObject({ total: 5000, withAnswer: 5000, highConfidence: 5000, needsReview: 0, incomplete: 0 });
    expect(r.questions[4999].options.map((o) => o.isCorrect)).toEqual([false, true, false, true, false]);
    expect(r.questions[4999].multipleCorrect).toBe(true);
    expect(r.questions[4999].options[4].text).toBe('Varianta e ștefan țară 5000');
  });
});
