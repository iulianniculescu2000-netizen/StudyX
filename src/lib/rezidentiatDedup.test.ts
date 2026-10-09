import { beforeEach, describe, expect, it } from 'vitest';
import { buildRezidentiatOverview } from './rezidentiatOverview';
import { startQuizMix } from './quizMixSession';
import { useQuizStore } from '../store/quizStore';
import type { Folder, Question, Quiz, QuestionStat } from '../types';

const folder = (id: string, name: string, parentId: string | null = null): Folder =>
  ({ id, name, emoji: '', color: 'blue', createdAt: 0, parentId }) as Folder;
const question = (id: string, stem: string, hidden = false): Question => ({
  id,
  text: stem,
  hidden: hidden || undefined,
  options: [['alfa', false], ['beta', true], ['gama', false]].map(([text, isCorrect], i) => ({ id: `${id}-${i}`, text: text as string, isCorrect: isCorrect as boolean })),
});
const quiz = (id: string, folderId: string, questions: Question[]): Quiz =>
  ({ id, title: id, description: '', emoji: '', category: '', folderId, createdAt: 0, color: 'blue', tags: ['rezidentiat'], questions }) as Quiz;
const stat = (correct: number, wrong: number): QuestionStat => ({ timesCorrect: correct, timesWrong: wrong }) as QuestionStat;

const folders = [folder('root', 'Rezidențiat'), folder('d1', 'Chirurgie', 'root'), folder('s1', 'Esofagul', 'd1'), folder('s2', 'Stomacul', 'd1')];
const A = 'Care dintre afirmațiile despre esofagul Barrett este adevărată în cazul displaziei severe';
const B = 'Care este tratamentul de elecție al acalaziei esofagiene în stadiul avansat de boală';

describe('overview with duplicates', () => {
  const quizzes = [
    quiz('a', 's1', [question('a1', A), question('a2', B)]),
    quiz('b', 's2', [question('b1', `3. ${A} (pg. 4)`), question('b2', 'Altceva complet diferit despre pancreas și ficat în context chirurgical')]),
  ];

  it('counts each duplicate group once, at its first copy', () => {
    const o = buildRezidentiatOverview(folders, quizzes, {}, []);
    expect(o.totalQuestions).toBe(3);
    expect(o.duplicates.duplicateCount).toBe(1);
    const [esofag, stomac] = o.disciplines[0].specialties;
    expect(esofag.questionCount).toBe(2);
    expect(stomac.questionCount).toBe(1);
  });

  it('marks the group answered when any copy was, by quiz key or by mix id', () => {
    const viaCopy = buildRezidentiatOverview(folders, quizzes, { 'b:b1': stat(1, 0) }, []);
    expect(viaCopy.disciplines[0].specialties[0].answered).toBe(1);
    expect(viaCopy.disciplines[0].specialties[1].answered).toBe(0);
    const viaMix = buildRezidentiatOverview(folders, quizzes, { 'mix-s2:b1': stat(0, 1) }, []);
    expect(viaMix.disciplines[0].specialties[0].answered).toBe(1);
  });

  it('does not double-count when both copies were answered and leaves quizzes untouched', () => {
    const o = buildRezidentiatOverview(folders, quizzes, { 'a:a1': stat(1, 0), 'b:b1': stat(1, 0) }, []);
    expect(o.disciplines[0].specialties.reduce((sum, s) => sum + s.answered, 0)).toBe(1);
    expect(o.disciplines[0].specialties[1].quizzes.map((x) => x.questions.length)).toEqual([2]);
  });

  it('ignores a hidden question that belongs to no group, but still counts hidden copies once through their group', () => {
    const withLone = [quiz('a', 's1', [question('a1', A, true), question('a2', B)])];
    expect(buildRezidentiatOverview(folders, withLone, {}, []).totalQuestions).toBe(1);
    const hiddenCopy = [quizzes[0], quiz('b', 's2', [question('b1', A, true)])];
    expect(buildRezidentiatOverview(folders, hiddenCopy, {}, []).totalQuestions).toBe(2);
  });
});

describe('hiding duplicates', () => {
  beforeEach(() => useQuizStore.getState().reset());

  it('setQuestionsHidden is reversible and touches only the named questions', () => {
    useQuizStore.getState().addQuiz(quiz('b', 's2', [question('b1', A), question('b2', B)]));
    useQuizStore.getState().setQuestionsHidden([{ quizId: 'b', questionIds: ['b1'] }], true);
    const hidden = useQuizStore.getState().quizzes[0].questions;
    expect(hidden.map((x) => x.hidden)).toEqual([true, undefined]);
    useQuizStore.getState().setQuestionsHidden([{ quizId: 'b', questionIds: ['b1'] }], false);
    const shown = useQuizStore.getState().quizzes[0].questions;
    expect(shown.every((x) => x.hidden !== true)).toBe(true);
  });

  it('combined sessions skip hidden questions', () => {
    const f = folder('s1', 'Esofagul', 'd1');
    const set = [quiz('a', 's1', [question('a1', A), question('a2', B, true)]), quiz('c', 's1', [question('c1', 'Alta')])];
    const id = startQuizMix(f, set);
    expect(useQuizStore.getState().quizzes.find((x) => x.id === id)?.questions.map((x) => x.id)).toEqual(['a1', 'c1']);
  });
});
