/**
 * What the general chat and the Rezidențiat chat know about the student's progress. A quiz belongs to Rezidențiat
 * when it carries the Rezidențiat tag (see `isRezidentiatQuiz`); everything else is general. The summaries,
 * weak topics and „Unde am rămas” of one chat therefore never mention the other's material.
 */
import { buildPerformanceSummary, type PerformanceSummary } from '../aiContext';
import { getWeakTopicsForProfile } from '../../ai/UserProfile';
import type { WeakTopic } from '../../ai/types';
import { isRezidentiatQuiz } from '../rezidentiatBank';
import type { SourceScope } from './sourceScope';
import { useStatsStore } from '../../store/statsStore';
import type { Quiz, QuestionStat, StudyStreak } from '../../types';

const inScope = (quiz: Pick<Quiz, 'tags'>, scope: SourceScope) => isRezidentiatQuiz(quiz) === (scope === 'rezidentiat');

/** Same topic key the user profile uses for a question: its tags, or its category. */
const topicsOf = (question: { tags?: string[]; category?: string }): string[] =>
  question.tags?.length ? question.tags : [question.category || 'Topic general'];

export function quizzesForScope(quizzes: ReadonlyArray<Quiz>, scope: SourceScope): Quiz[] {
  return quizzes.filter((quiz) => inScope(quiz, scope));
}

/** Study stats of the quizzes that belong to a scope (stats are keyed `${quizId}:${questionId}` and carry `quizId`). */
export function statsForScope(
  questionStats: Record<string, QuestionStat>,
  quizzes: ReadonlyArray<Quiz>,
  scope: SourceScope,
): Record<string, QuestionStat> {
  const ids = new Set(quizzesForScope(quizzes, scope).map((quiz) => quiz.id));
  const out: Record<string, QuestionStat> = {};
  for (const [key, stat] of Object.entries(questionStats)) if (ids.has(stat.quizId)) out[key] = stat;
  return out;
}

export function buildScopedPerformanceSummary(
  scope: SourceScope,
  questionStats: Record<string, QuestionStat>,
  streak: Pick<StudyStreak, 'currentStreak'>,
  quizzes: ReadonlyArray<Quiz>,
): PerformanceSummary {
  const scopedQuizzes = quizzesForScope(quizzes, scope);
  const stats = statsForScope(questionStats, quizzes, scope);
  const now = Date.now();
  const getDueQuestions = () => Object.values(stats).filter((stat) => stat.nextReview > 0 && stat.nextReview <= now);
  const getAccuracy = () => {
    const live = Object.values(stats).filter((stat) => !stat.retired);
    if (live.length === 0) return 0;
    const total = live.reduce((sum, stat) => sum + stat.timesCorrect + stat.timesWrong, 0);
    if (total === 0) return 0;
    return Math.round((live.reduce((sum, stat) => sum + stat.timesCorrect, 0) / total) * 100);
  };
  return buildPerformanceSummary(stats, streak, getDueQuestions, getAccuracy, useStatsStore.getState().getStatsByTag, scopedQuizzes);
}

/**
 * The profile's weakest topics, restricted to topics that actually occur in the quizzes of this scope.
 * The profile aggregates every answer by topic name, so a topic that exists in both spaces (e.g. „Cardiologie”)
 * would otherwise show the combined accuracy. When `questionStats` is given, such a topic is re-measured from this
 * scope's own answers (and dropped if this scope has none), so neither space inherits the other's mistakes.
 */
export function scopedWeakTopics(
  profileId: string,
  scope: SourceScope,
  quizzes: ReadonlyArray<Quiz>,
  limit = 4,
  questionStats?: Record<string, QuestionStat>,
): WeakTopic[] {
  const topics = new Set<string>();
  for (const quiz of quizzesForScope(quizzes, scope)) for (const question of quiz.questions) for (const topic of topicsOf(question)) topics.add(topic);
  const otherTopics = new Set<string>();
  for (const quiz of quizzes) {
    if (inScope(quiz, scope)) continue;
    for (const question of quiz.questions) for (const topic of topicsOf(question)) otherTopics.add(topic);
  }
  const profileTopics = getWeakTopicsForProfile(profileId, Number.POSITIVE_INFINITY).filter((entry) => topics.has(entry.topic));
  if (!questionStats) return profileTopics.slice(0, limit);

  const own = new Map<string, { correct: number; wrong: number }>();
  for (const quiz of quizzesForScope(quizzes, scope)) {
    for (const question of quiz.questions) {
      const stat = questionStats[`${quiz.id}:${question.id}`];
      if (!stat || stat.retired) continue;
      for (const topic of topicsOf(question)) {
        const acc = own.get(topic) ?? { correct: 0, wrong: 0 };
        acc.correct += stat.timesCorrect;
        acc.wrong += stat.timesWrong;
        own.set(topic, acc);
      }
    }
  }
  const result: WeakTopic[] = [];
  for (const entry of profileTopics) {
    if (!otherTopics.has(entry.topic)) { result.push(entry); continue; }
    const mine = own.get(entry.topic);
    const total = mine ? mine.correct + mine.wrong : 0;
    if (!mine || total === 0) continue;
    result.push({ ...entry, total, wrongCount: mine.wrong, accuracy: Math.round((mine.correct / total) * 100) });
  }
  return result.sort((a, b) => a.accuracy - b.accuracy || b.wrongCount - a.wrongCount).slice(0, limit);
}
