import type { QuestionStat, Quiz } from '../types';
import { computeTopicMastery, TOPIC_PRACTICE_TAG } from './topicMastery';

export interface MasteryDelta {
  topic: string;
  /** Stăpânirea înainte de sesiune; `null` când subiectul nu avea răspunsuri până acum. */
  before: number | null;
  after: number;
  /** Răspunsuri date în sesiune. */
  answeredNow: number;
}

const isCorrect = (question: Quiz['questions'][number], given: readonly string[]) => {
  const correct = question.options.filter((option) => option.isCorrect).map((option) => option.id);
  return given.length === correct.length && correct.every((id) => given.includes(id));
};

/**
 * Cât s-a mișcat stăpânirea subiectului printr-o sesiune de exersare. „Înainte” se obține scăzând din statistici doar
 * răspunsurile din sesiune (restul istoricului rămâne), deci nu cere un instantaneu salvat. `null` pentru orice alt set.
 */
export function topicMasteryDelta(
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
  quiz: Quiz,
  answers: Record<string, string[]> | undefined,
  now: number = Date.now(),
): MasteryDelta | null {
  if (!(quiz.tags ?? []).includes(TOPIC_PRACTICE_TAG)) return null;
  const topic = quiz.questions.map((question) => question.tags?.[0]).find((tag): tag is string => !!tag);
  if (!topic) return null;

  const after = computeTopicMastery(quizzes, stats, now).find((entry) => entry.topic === topic);
  if (!after) return null;

  const rewound: Record<string, QuestionStat> = { ...stats };
  let answeredNow = 0;
  for (const question of quiz.questions) {
    const given = answers?.[question.id];
    const key = `${quiz.id}:${question.id}`;
    const stat = rewound[key];
    if (!given || given.length === 0 || !stat) continue;
    answeredNow += 1;
    rewound[key] = isCorrect(question, given)
      ? { ...stat, timesCorrect: Math.max(0, stat.timesCorrect - 1) }
      : { ...stat, timesWrong: Math.max(0, stat.timesWrong - 1) };
  }

  const before = computeTopicMastery(quizzes, rewound, now).find((entry) => entry.topic === topic);
  return { topic, before: before ? before.mastery : null, after: after.mastery, answeredNow };
}
