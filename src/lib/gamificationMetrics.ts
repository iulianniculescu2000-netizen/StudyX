/**
 * Cifrele din care se calculează realizările, într-un singur loc: pagina Realizări și urmăritorul care
 * înregistrează realizările definitiv citesc aceleași valori, deci nu pot ajunge la concluzii diferite.
 */
import type { Quiz, QuizSession, QuestionStat, StudyStreak } from '../types';
import type { GamificationMetrics } from '../components/gamification/gamificationCatalog';
import {
  MIN_QUESTIONS_FOR_RHYTHM,
  PERFECT_MIN_QUESTIONS,
  bestStreak,
  computeCategoryMastery,
  countOwnSets,
  effectiveStreak,
  masteryProgress,
  perfectSessionCount,
  sessionsThisWeek,
  studyMinutesThisWeek,
} from './gamificationProgress';
import { localDateStr } from './studyPlan';

export function buildGamificationMetrics(
  input: { quizzes: Quiz[]; sessions: QuizSession[]; streak: StudyStreak; questionStats: Record<string, QuestionStat> },
  now: number,
): GamificationMetrics {
  const { quizzes, sessions, streak, questionStats } = input;
  return {
    quizCount: countOwnSets(quizzes),
    perfectSessions: perfectSessionCount(sessions, PERFECT_MIN_QUESTIONS),
    bestStreak: bestStreak(streak.currentStreak, streak.longestStreak),
    liveStreak: effectiveStreak(streak, localDateStr(new Date(now))),
    mastery: masteryProgress(computeCategoryMastery(quizzes, questionStats)),
    sessionsThisWeek: sessionsThisWeek(sessions, now, MIN_QUESTIONS_FOR_RHYTHM),
    studyMinutesThisWeek: studyMinutesThisWeek(sessions, now),
  };
}
