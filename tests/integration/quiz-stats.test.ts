import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuizStore } from '../../src/store/quizStore';
import { useStatsStore } from '../../src/store/statsStore';
import type { Quiz, QuizSession } from '../../src/types';

const sampleQuiz: Quiz = {
  id: 'quiz-1',
  title: 'Cardio rapid',
  description: 'Set de verificare',
  emoji: 'C',
  category: 'Cardiologie',
  color: 'blue',
  tags: ['cardio', 'fiziopatologie'],
  createdAt: Date.now(),
  questions: [
    {
      id: 'q1',
      text: 'Ce camera pompeaza sangele in aorta?',
      options: [
        { id: 'a', text: 'Atriu drept', isCorrect: false },
        { id: 'b', text: 'Ventricul stang', isCorrect: true },
      ],
    },
    {
      id: 'q2',
      text: 'Ce valva separa atriul stang de ventriculul stang?',
      options: [
        { id: 'a', text: 'Mitrală', isCorrect: true },
        { id: 'b', text: 'Tricuspidă', isCorrect: false },
      ],
    },
  ],
};

function session(overrides: Partial<QuizSession>): QuizSession {
  return {
    id: `session-${Math.random()}`,
    quizId: 'quiz-1',
    answers: {},
    startedAt: Date.now(),
    finishedAt: Date.now(),
    score: 0,
    total: 1,
    mode: 'study',
    ...overrides,
  };
}

describe('quiz and stats store integration', () => {
  beforeEach(() => {
    useQuizStore.getState().reset();
    useStatsStore.getState().reset();
    vi.setSystemTime(new Date('2026-05-04T10:00:00.000Z'));
  });

  it('stores quizzes, sessions and computes best score from current session schema', () => {
    useQuizStore.getState().addQuiz(sampleQuiz);
    useQuizStore.getState().addSession(session({ id: 'low', score: 1, total: 2 }));
    useQuizStore.getState().addSession(session({ id: 'high', score: 2, total: 2 }));

    expect(useQuizStore.getState().quizzes).toHaveLength(1);
    expect(useQuizStore.getState().getSessionsForQuiz('quiz-1').map((item) => item.id)).toEqual(['high', 'low']);
    expect(useQuizStore.getState().getBestScore('quiz-1')).toBe(100);
  });

  it('duplicates quizzes without reusing question ids', () => {
    useQuizStore.getState().addQuiz(sampleQuiz);

    const duplicateId = useQuizStore.getState().duplicateQuiz('quiz-1');
    const duplicate = useQuizStore.getState().quizzes.find((quiz) => quiz.id === duplicateId);

    expect(duplicateId).toBeTruthy();
    expect(duplicate?.title).toContain(sampleQuiz.title);
    expect(duplicate?.questions).toHaveLength(sampleQuiz.questions.length);
    expect(duplicate?.questions.map((question) => question.id)).not.toEqual(sampleQuiz.questions.map((question) => question.id));
  });

  it('records answers with quiz-scoped keys and computes accuracy', () => {
    const stats = useStatsStore.getState();

    stats.recordAnswer('quiz-1', 'q1', true);
    stats.recordAnswer('quiz-1', 'q1', false);
    stats.recordAnswer('quiz-1', 'q2', false);

    expect(useStatsStore.getState().questionStats['quiz-1:q1']).toMatchObject({
      quizId: 'quiz-1',
      questionId: 'q1',
      timesCorrect: 1,
      timesWrong: 1,
    });
    expect(useStatsStore.getState().getAccuracy('quiz-1')).toBe(33);
    expect(useStatsStore.getState().getWeakQuestions(1)[0].questionId).toBe('q2');
  });

  it('updates study streak once per date while still accumulating study time', () => {
    const stats = useStatsStore.getState();

    stats.recordStudySession(120);
    stats.recordStudySession(60);

    expect(useStatsStore.getState().totalStudyTime).toBe(180);
    expect(useStatsStore.getState().streak.currentStreak).toBe(1);
    expect(useStatsStore.getState().streak.studyDates).toEqual(['2026-05-04']);

    vi.setSystemTime(new Date('2026-05-05T10:00:00.000Z'));
    useStatsStore.getState().recordStudySession(30);

    expect(useStatsStore.getState().totalStudyTime).toBe(210);
    expect(useStatsStore.getState().streak.currentStreak).toBe(2);
    expect(useStatsStore.getState().streak.longestStreak).toBe(2);
  });

  it('aggregates tag stats from quiz tags and recorded answers', () => {
    useStatsStore.getState().recordAnswer('quiz-1', 'q1', true);
    useStatsStore.getState().recordAnswer('quiz-1', 'q2', false);

    const byTag = useStatsStore.getState().getStatsByTag([sampleQuiz]);

    expect(byTag.cardio).toEqual({ correct: 1, total: 2 });
    expect(byTag.fiziopatologie).toEqual({ correct: 1, total: 2 });
  });
});
