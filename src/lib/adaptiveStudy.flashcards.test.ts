import { describe, expect, it } from 'vitest';
import type { Question, Quiz } from '../types';
import { buildAdaptiveExamQuiz, buildWeaknessRecoveryQuiz } from './adaptiveStudy';
import { startQuizMix } from './quizMixSession';

const q = (id: string, text: string, options: { text: string; isCorrect: boolean }[]): Question => ({
  id, text, multipleCorrect: false, options: options.map((o, i) => ({ id: `${id}-${i}`, ...o })),
} as Question);

const card = q('c1', 'Proteina pentru monitorizarea HIV?', [{ text: 'p24.', isCorrect: true }]);
const grila = q('g1', 'Care e capitala?', [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }]);
const mk = (id: string, kind: Quiz['kind'], questions: Question[]) =>
  ({ id, title: id, kind, questions, tags: [], folderId: null, createdAt: 1 }) as unknown as Quiz;

const stats = {
  'deck:c1': { quizId: 'deck', questionId: 'c1', timesWrong: 5, timesCorrect: 0, nextReview: 0 },
  'qz:g1': { quizId: 'qz', questionId: 'g1', timesWrong: 5, timesCorrect: 0, nextReview: 0 },
} as never;
const quizzes = [mk('deck', 'flashcard', [card]), mk('qz', 'quiz', [grila])];

describe('sesiuni de grile nu includ flashcarduri', () => {
  it('recuperarea focusată păstrează doar grilele', () => {
    const quiz = buildWeaknessRecoveryQuiz('p', quizzes, stats);
    expect(quiz?.questions.map((x) => x.text)).toEqual([grila.text]);
  });
  it('simularea adaptivă păstrează doar grilele', () => {
    const quiz = buildAdaptiveExamQuiz('p', quizzes, stats);
    expect(quiz?.questions.map((x) => x.text)).toEqual([grila.text]);
  });
  it('doar flashcarduri => nicio sesiune', () => {
    expect(buildWeaknessRecoveryQuiz('p', [quizzes[0]], stats)).toBeNull();
  });
  it('mixul de folder ignoră pachetele de flashcarduri', () => {
    expect(startQuizMix({ id: 'f', name: 'F', emoji: '', color: 'red' } as never, [quizzes[0]])).toBeNull();
  });
});
