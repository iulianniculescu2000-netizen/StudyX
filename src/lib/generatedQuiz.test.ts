import { beforeEach, describe, expect, it } from 'vitest';
import { upsertGeneratedQuiz } from './generatedQuiz';
import { useQuizStore } from '../store/quizStore';
import type { Quiz } from '../types';

const make = (id: string, questionIds: string[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: 'Caiet de erori', description: '', emoji: '📕', color: 'red', category: 'Altele', kind: 'quiz',
  tags: ['mistake-bank', 'recovery'], createdAt: 1,
  questions: questionIds.map((qid) => ({ id: qid, text: qid, options: [{ id: `${qid}a`, text: 'a', isCorrect: true }] })),
  ...extra,
});

describe('upsertGeneratedQuiz', () => {
  beforeEach(() => useQuizStore.setState({ quizzes: [], sessions: [] }));

  it('adds the first generated quiz and then reuses it, replacing the questions', () => {
    expect(upsertGeneratedQuiz(make('n1', ['a', 'b']))).toBe('n1');
    expect(upsertGeneratedQuiz(make('n2', ['c']))).toBe('n1');
    expect(upsertGeneratedQuiz(make('n3', ['d', 'e', 'f']))).toBe('n1');
    const { quizzes } = useQuizStore.getState();
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0].questions.map((x) => x.id)).toEqual(['d', 'e', 'f']);
  });

  it('keeps the id of a question whose text is unchanged', () => {
    const withText = (id: string, text: string) => ({ id, text, options: [{ id: `${id}a`, text: 'a', isCorrect: true }] });
    upsertGeneratedQuiz(make('n1', [], { questions: [withText('old1', 'Același'), withText('old2', 'Dispare')] }));
    upsertGeneratedQuiz(make('n2', [], { questions: [withText('new1', 'Același'), withText('new2', 'Nou')] }));
    expect(useQuizStore.getState().quizzes[0].questions.map((x) => x.id)).toEqual(['old1', 'new2']);
  });

  it('keeps different kinds (other title/tags) and ordinary quizzes apart', () => {
    useQuizStore.setState({ quizzes: [make('own', ['x'], { title: 'Caiet de erori', tags: ['personal'] })] });
    expect(upsertGeneratedQuiz(make('n1', ['a']))).toBe('n1');
    expect(upsertGeneratedQuiz(make('n2', ['b'], { title: 'Quiz din greșeli', tags: ['greșeli', 'recapitulare'] }))).toBe('n2');
    expect(useQuizStore.getState().quizzes).toHaveLength(3);
  });
});
