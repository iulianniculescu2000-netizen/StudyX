import { describe, expect, it } from 'vitest';
import { aiPracticeTitle, buildAiPracticeQuiz } from './topicAiPractice';
import { computeTopicMastery, TOPIC_PRACTICE_TAG } from './topicMastery';
import type { Question } from '../types';

const question = (id: string): Question => ({
  id, text: `Întrebarea ${id}`, tags: ['altceva'],
  options: [{ id: `${id}a`, text: 'A', isCorrect: true }, { id: `${id}b`, text: 'B', isCorrect: false }],
}) as Question;

describe('buildAiPracticeQuiz', () => {
  it('nu face set din zero întrebări', () => {
    expect(buildAiPracticeQuiz('Aritmii', [])).toBeNull();
  });

  it('etichetează setul și întrebările cu subiectul, cu id-uri noi', () => {
    const quiz = buildAiPracticeQuiz('Aritmii', [question('q1'), question('q2')])!;
    expect(quiz.title).toBe(aiPracticeTitle('Aritmii'));
    expect(quiz.tags).toEqual(['ai', 'recovery', TOPIC_PRACTICE_TAG]);
    expect(quiz.questions.map((q) => q.tags)).toEqual([['Aritmii'], ['Aritmii']]);
    expect(quiz.questions.some((q) => q.id === 'q1')).toBe(false);
  });

  it('răspunsurile din setul AI mută scorul subiectului', () => {
    const quiz = buildAiPracticeQuiz('Aritmii', [question('q1'), question('q2'), question('q3')])!;
    const stats = Object.fromEntries(quiz.questions.map((q) => [`${quiz.id}:${q.id}`, {
      quizId: quiz.id, questionId: q.id, timesCorrect: 2, timesWrong: 0, lastSeen: 1, nextReview: 0, interval: 1,
    }]));
    const [topic] = computeTopicMastery([quiz], stats, 1);
    expect(topic).toMatchObject({ topic: 'Aritmii', answered: 6 });
  });
});
