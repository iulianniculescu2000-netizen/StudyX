import { beforeEach, describe, expect, it } from 'vitest';
import { useQuizStore } from './quizStore';
import type { Quiz } from '../types';

const q = (id: string) => ({ id, title: id, questions: [] }) as unknown as Quiz;

describe('addQuizzes', () => {
  beforeEach(() => useQuizStore.setState({ quizzes: [q('old')] }));

  it('dă aceeași ordine ca addQuiz apelat pe rând, cu o singură notificare', () => {
    const sequential = (() => {
      useQuizStore.setState({ quizzes: [q('old')] });
      ['a', 'b', 'c'].forEach((id) => useQuizStore.getState().addQuiz(q(id)));
      return useQuizStore.getState().quizzes.map((x) => x.id);
    })();

    useQuizStore.setState({ quizzes: [q('old')] });
    let calls = 0;
    const unsubscribe = useQuizStore.subscribe(() => { calls += 1; });
    useQuizStore.getState().addQuizzes([q('a'), q('b'), q('c')]);
    unsubscribe();

    expect(useQuizStore.getState().quizzes.map((x) => x.id)).toEqual(sequential);
    expect(calls).toBe(1);
  });
});

import { accuracyByQuiz } from './statsStore';

describe('accuracyByQuiz', () => {
  it('calculează pe set într-o trecere și ignoră istoricul retras', () => {
    const stat = (quizId: string, correct: number, wrong: number, retired = false) =>
      ({ quizId, questionId: 'x', timesCorrect: correct, timesWrong: wrong, lastSeen: 0, nextReview: 0, interval: 1, retired }) as never;
    const map = accuracyByQuiz({ 'a:1': stat('a', 3, 1), 'a:2': stat('a', 1, 3), 'b:1': stat('b', 9, 0, true), 'c:1': stat('c', 0, 0) });
    expect(map.get('a')).toBe(50);
    expect(map.has('b')).toBe(false);
    expect(map.get('c')).toBe(0);
  });
});
