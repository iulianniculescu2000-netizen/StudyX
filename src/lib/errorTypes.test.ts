import { describe, expect, it } from 'vitest';
import type { QuestionStat, Quiz } from '../types';
import { buildErrorEntries } from './errorNotebook';
import {
  ERROR_TYPES,
  distractorExplanationHints,
  distractorTagHints,
  localSocraticQuestions,
  normalizeErrorType,
  summarizeErrorTypes,
} from './errorTypes';

const quiz = (id: string, qids: string[]) =>
  ({
    id, title: `Test ${id}`, category: 'Cardiologie',
    questions: qids.map((q) => ({ id: q, text: `Întrebare ${q}`, options: [{ id: 'o', text: 'x', isCorrect: true }] })),
  }) as unknown as Quiz;
const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 0, timesWrong: 2, lastSeen: 10, nextReview: 0, interval: 1, ...extra,
});

describe('errorTypes', () => {
  it('are cele cinci tipuri cerute, fără diacritice de sedilă', () => {
    expect(ERROR_TYPES.map((type) => type.id)).toEqual(['definitie', 'mecanism', 'exceptie', 'vecin', 'inversare']);
    const text = JSON.stringify(ERROR_TYPES);
    expect(text).not.toMatch(/[ŞşŢţ]/); // sedilă interzisă
  });

  it('normalizeErrorType acceptă doar tipuri cunoscute (profiluri vechi sau editate de mână)', () => {
    expect(normalizeErrorType('mecanism')).toBe('mecanism');
    expect(normalizeErrorType(undefined)).toBeUndefined();
    expect(normalizeErrorType('altceva')).toBeUndefined();
    expect(normalizeErrorType(3)).toBeUndefined();
  });

  it('citește indiciile din tag-urile distractori:...', () => {
    expect(distractorTagHints({ tags: ['cardio', 'distractori:externa'] })[0]).toContain('din afara temei');
    expect(distractorTagHints({ tags: ['distractori:ceva-nou'] })).toEqual(['distractori: ceva-nou']);
    expect(distractorTagHints({ tags: ['cardio'] })).toEqual([]);
    expect(distractorTagHints({})).toEqual([]);
  });

  it('scoate din explicație propozițiile despre distractori', () => {
    const hints = distractorExplanationHints({
      explanation: 'Stenoza aortică dă sufluri sistolice. Varianta B este greșită deoarece aparține insuficienței mitrale. Atât.',
    });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('Varianta B');
    expect(distractorExplanationHints({})).toEqual([]);
  });

  it('întrebările locale sunt trei, nu dau răspunsul și țin cont de tag-ul distractorilor', () => {
    const plain = localSocraticQuestions({});
    expect(plain).toHaveLength(3);
    const tagged = localSocraticQuestions({ tags: ['distractori:externa'] });
    expect(tagged[1]).not.toBe(plain[1]);
    for (const q of [...plain, ...tagged]) expect(q).toContain('?');
  });

  it('agregă pe tipuri doar intrările categorisate și numără separat pe cele fără tip', () => {
    const quizzes = [quiz('a', ['1', '2', '3', '4'])];
    const stats = {
      'a:1': stat('a', '1', { timesWrong: 4, errorType: 'mecanism' }),
      'a:2': stat('a', '2', { errorType: 'mecanism' }),
      'a:3': stat('a', '3', { errorType: 'inversare' }),
      'a:4': stat('a', '4'),
    };
    const summary = summarizeErrorTypes(buildErrorEntries(quizzes, stats));
    expect(summary.typed).toBe(3);
    expect(summary.untyped).toBe(1);
    expect(summary.rows[0]).toMatchObject({ type: 'mecanism', questions: 2, wrong: 6, share: 67 });
    expect(summary.rows[1]).toMatchObject({ type: 'inversare', questions: 1, share: 33 });
  });

  it('un tip necunoscut din fișier nu strică agregarea', () => {
    const quizzes = [quiz('a', ['1'])];
    const stats = { 'a:1': stat('a', '1', { errorType: 'zzz' as never }) };
    expect(summarizeErrorTypes(buildErrorEntries(quizzes, stats))).toMatchObject({ typed: 0, untyped: 1, rows: [] });
  });
});
