import { describe, expect, it } from 'vitest';
import { buildTopicPracticeQuiz, topicPracticeTitle } from './topicPractice';
import { computeTopicMastery, TOPIC_PRACTICE_TAG } from './topicMastery';
import type { QuestionStat, Quiz } from '../types';

const NOW = 1_000_000_000;
const quiz = (id: string, category: string, texts: string[], extra: Partial<Quiz> = {}) =>
  ({
    id, title: `Test ${id}`, category, kind: 'quiz',
    questions: texts.map((text, i) => ({ id: `${id}${i}`, text, options: [{ id: 'a', text: 'x', isCorrect: true }, { id: 'b', text: 'y', isCorrect: false }] })),
    ...extra,
  }) as unknown as Quiz;
const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 0, timesWrong: 0, lastSeen: NOW, nextReview: 0, interval: 1, ...extra,
});

describe('buildTopicPracticeQuiz', () => {
  const quizzes = [quiz('a', 'Aritmii', ['Q-rău', 'Q-bun', 'Q-nou']), quiz('b', 'Nefro', ['Altceva'])];
  const stats = {
    'a:a0': stat('a', 'a0', { timesWrong: 3, timesCorrect: 1 }),
    'a:a1': stat('a', 'a1', { timesCorrect: 4, consecutiveCorrect: 4 }),
  };

  it('pune întâi întrebările greșite, apoi pe cele nevăzute, iar pe cele închise la urmă', () => {
    const built = buildTopicPracticeQuiz('Aritmii', quizzes, stats, 10, NOW)!;
    expect(built.questions.map((q) => q.text)).toEqual(['Q-rău', 'Q-nou', 'Q-bun']);
    expect(built.title).toBe(topicPracticeTitle('Aritmii'));
    expect(built.tags).toEqual(['recovery', TOPIC_PRACTICE_TAG]);
  });

  it('clonează întrebările cu id-uri noi și eticheta subiectului', () => {
    const built = buildTopicPracticeQuiz('Aritmii', quizzes, stats, 10, NOW)!;
    const ids = new Set(['a0', 'a1', 'a2']);
    expect(built.questions.every((q) => !ids.has(q.id) && q.tags?.[0] === 'Aritmii')).toBe(true);
  });

  it('respectă limita și nu repetă texte identice', () => {
    const dup = [...quizzes, quiz('c', 'Aritmii', ['Q-rău'])];
    const built = buildTopicPracticeQuiz('Aritmii', dup, stats, 2, NOW)!;
    expect(built.questions).toHaveLength(2);
  });

  it('întoarce null când subiectul nu are întrebări', () => {
    expect(buildTopicPracticeQuiz('Inexistent', quizzes, stats, 10, NOW)).toBeNull();
  });

  it('răspunsurile din exersare mută scorul subiectului, spre deosebire de alte sesiuni generate', () => {
    const built = buildTopicPracticeQuiz('Aritmii', quizzes, stats, 10, NOW)!;
    const practiceStats = Object.fromEntries(
      built.questions.map((q) => [`${built.id}:${q.id}`, stat(built.id, q.id, { timesCorrect: 3 })]),
    );
    const before = computeTopicMastery(quizzes, stats, NOW).find((t) => t.topic === 'Aritmii')!;
    const after = computeTopicMastery([...quizzes, built], { ...stats, ...practiceStats }, NOW).find((t) => t.topic === 'Aritmii')!;
    expect(after.mastery).toBeGreaterThan(before.mastery);

    const other = computeTopicMastery([...quizzes, { ...built, tags: ['recovery'] }], { ...stats, ...practiceStats }, NOW).find((t) => t.topic === 'Aritmii')!;
    expect(other.mastery).toBe(before.mastery);
  });
});
