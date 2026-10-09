import { describe, it, expect } from 'vitest';
import { findDuplicates, findDuplicatesCached, normalizeStem, playableQuestions, redundantMembers } from './bankDedup';
import type { Question, Quiz } from '../types';

const q = (id: string, text: string, options: Array<[string, boolean]>, extra: Partial<Question> = {}): Question => ({
  id,
  text,
  options: options.map(([t, isCorrect], i) => ({ id: `${id}-o${i}`, text: t, isCorrect })),
  ...extra,
});
const quiz = (id: string, questions: Question[], extra: Partial<Quiz> = {}): Quiz =>
  ({ id, title: id, description: '', emoji: '', category: '', createdAt: 0, color: 'blue', questions, ...extra }) as Quiz;

const STEM = 'Cauze cardiace de lipotimie şi sincopă sunt următoarele, cu excepţia';
const OPTIONS: Array<[string, boolean]> = [
  ['stenoză aortică strânsă', false],
  ['cardiomiopatia hipertrofică obstructivă', false],
  ['mixom atrial stâng', false],
  ['hipotensiunea arterială', true],
];

describe('normalizeStem', () => {
  it('ignores diacritics (cedilla and comma forms), case, numbering and page suffixes', () => {
    const base = normalizeStem(STEM);
    expect(normalizeStem('12. Cauze cardiace de lipotimie și sincopă sunt următoarele, cu excepția (pg. 28)')).toBe(base);
    expect(normalizeStem('(3) CAUZE CARDIACE DE LIPOTIMIE ŞI SINCOPA SUNT URMATOARELE cu exceptia: (pag 27)')).toBe(base);
  });
  it('keeps meaningful numbers', () => {
    expect(normalizeStem('Doza este 5 mg')).not.toBe(normalizeStem('Doza este 6 mg'));
  });
});

describe('findDuplicates', () => {
  it('groups exact duplicates across quizzes ignoring option order, diacritics, numbering and page suffix', () => {
    const shuffled = [OPTIONS[3], OPTIONS[1], OPTIONS[0], OPTIONS[2]] as Array<[string, boolean]>;
    const a = quiz('a', [q('a1', STEM, OPTIONS)]);
    const b = quiz('b', [q('b1', `7. ${STEM.replace('ş', 'ș').replace('ţ', 'ț')} (pg. 28)`, shuffled)]);
    const report = findDuplicates([a, b]);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].kind).toBe('exact');
    expect(report.groups[0].members.map((m) => m.quizId)).toEqual(['a', 'b']);
    expect(report.groups[0].primary.quizId).toBe('a');
    expect(report.duplicateCount).toBe(1);
    expect(report.groupOf.get('b:b1')).toBe(report.groups[0]);
    expect(redundantMembers(report).map((m) => m.questionId)).toEqual(['b1']);
  });

  it('groups near duplicates (a one-letter typo) with the same correct answer', () => {
    const longStem = 'Din tratamentul medicamentos al insuficienței venoase cronice, conform ghidurilor europene recente, nu fac parte următoarele';
    const opts: Array<[string, boolean]> = [
      ['flebotonice și venotonice administrate cronic', false],
      ['compresie elastică de gradul doi', false],
      ['anticoagulante orale la toți pacienții', true],
      ['sclerozarea ecoghidată a varicelor', false],
    ];
    const a = quiz('a', [q('a1', `${longStem}:`, opts)]);
    const b = quiz('b', [q('b1', longStem.replace('recente', 'recent'), opts)]);
    const report = findDuplicates([a, b]);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].kind).toBe('near');
  });

  it('never merges when the correct answers differ and flags a conflict instead', () => {
    const flipped = OPTIONS.map(([t, c], i) => [t, i === 0 ? true : i === 3 ? false : c]) as Array<[string, boolean]>;
    const report = findDuplicates([quiz('a', [q('a1', STEM, OPTIONS)]), quiz('b', [q('b1', STEM, flipped)])]);
    expect(report.groups).toHaveLength(0);
    expect(report.duplicateCount).toBe(0);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].map((m) => m.quizId)).toEqual(['a', 'b']);
  });

  it('does not merge near-identical stems that differ in a number or in the picture', () => {
    const longStem = 'Un pacient primește o doză de 40 mg zilnic de furosemid timp de două săptămâni pentru edeme cardiace persistente rezistente';
    const a = quiz('a', [q('a1', longStem, OPTIONS)]);
    const b = quiz('b', [q('b1', longStem.replace('40', '80'), OPTIONS)]);
    expect(findDuplicates([a, b]).groups).toHaveLength(0);
    const c = quiz('c', [q('c1', STEM, OPTIONS, { imageUrl: 'data:image/png;base64,AAAA' })]);
    const d = quiz('d', [q('d1', STEM, OPTIONS, { imageUrl: 'data:image/png;base64,BBBB' })]);
    expect(findDuplicates([c, d]).groups).toHaveLength(0);
  });

  it('skips archived, flashcard and combined-session quizzes and unanswerable questions', () => {
    const copy = () => [q('x', STEM, OPTIONS)];
    const report = findDuplicates([
      quiz('a', copy()),
      quiz('b', copy(), { archived: true }),
      quiz('c', copy(), { kind: 'flashcard' }),
      quiz('d', copy(), { tags: ['folder-session:f1'] }),
      quiz('e', [q('y', STEM, OPTIONS.map(([t]) => [t, false] as [string, boolean]))]),
    ]);
    expect(report.groups).toHaveLength(0);
  });

  it('picks the first visible member as primary and keeps the group stable once copies are hidden', () => {
    const a = quiz('a', [q('a1', STEM, OPTIONS, { hidden: true })]);
    const b = quiz('b', [q('b1', STEM, OPTIONS)]);
    const c = quiz('c', [q('c1', STEM, OPTIONS)]);
    const report = findDuplicates([a, b, c]);
    expect(report.groups[0].members).toHaveLength(3);
    expect(report.groups[0].primary.quizId).toBe('b');
  });

  it('is fast on thousands of questions', () => {
    const quizzes: Quiz[] = [];
    for (let i = 0; i < 70; i += 1) {
      quizzes.push(quiz(`z${i}`, Array.from({ length: 60 }, (_, j) => {
        const n = i * 60 + j;
        return q(`q${n}`, `Întrebarea unică numărul ${n} despre afecțiunea ${n * 7} cu manifestări diverse și evoluție ${n % 13}`, [
          [`varianta ${n} alfa`, false], [`varianta ${n} beta`, true], [`varianta ${n} gama`, false], [`varianta ${n} delta`, false],
        ]);
      })));
    }
    quizzes.push(quiz('dup', [quizzes[3].questions[5], quizzes[40].questions[7]].map((x, i) => ({ ...x, id: `d${i}` }))));
    const started = performance.now();
    const report = findDuplicates(quizzes);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(report.groups).toHaveLength(2);
  });

  it('findDuplicatesCached reuses the result for the same list', () => {
    const list = [quiz('a', [q('a1', STEM, OPTIONS)])];
    expect(findDuplicatesCached(list)).toBe(findDuplicatesCached(list.slice()));
  });
});

describe('playableQuestions', () => {
  it('drops hidden questions and returns the same array when none is hidden', () => {
    const plain = quiz('a', [q('1', 'a', OPTIONS), q('2', 'b', OPTIONS)]);
    expect(playableQuestions(plain)).toBe(plain.questions);
    const some = quiz('b', [q('1', 'a', OPTIONS, { hidden: true }), q('2', 'b', OPTIONS)]);
    expect(playableQuestions(some).map((x) => x.id)).toEqual(['2']);
  });
});
