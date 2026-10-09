/**
 * Week-over-week deltas for the dashboard stat cards.
 *
 * These cards used to render a hard-coded "▲ 2%" next to every number, so the
 * app cheerfully reported growth on a zero streak. A delta is only meaningful
 * when there is a previous week to compare against — when there isn't, this
 * returns `null` and the card shows no badge at all rather than inventing one.
 */
import type { Quiz, QuizSession } from '../types';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface DashboardTrends {
  /** Percent change in quizzes created. */
  quizzes: number | null;
  /** Change in accuracy, in percentage POINTS (60% → 70% is +10). */
  accuracy: number | null;
  /** Percent change in time actually spent studying. */
  studyTime: number | null;
}

function percentChange(current: number, previous: number, minBase = 1): number | null {
  // Fără bază de comparație (sau cu una prea mică) un „trend” ar fi ficțiune: 1 → 356 ar scrie „+35400%”.
  if (previous <= 0 || previous < minBase) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  // O săritură de câteva sute de procente vine dintr-o bază minusculă (un import mare într-o săptămână), nu dintr-o tendință.
  return Math.abs(change) > 500 ? null : change;
}

function sessionDurationMs(session: QuizSession): number {
  if (!session.finishedAt) return 0;
  const span = session.finishedAt - session.startedAt;
  return span > 0 ? span : 0;
}

export function computeDashboardTrends(
  quizzes: Quiz[],
  sessions: QuizSession[],
  now: number = Date.now(),
): DashboardTrends {
  const currentFrom = now - WEEK_MS;
  const previousFrom = now - 2 * WEEK_MS;

  const inWindow = (at: number, from: number, to: number) => at >= from && at < to;

  const createdCurrent = quizzes.filter((q) => inWindow(q.createdAt, currentFrom, now)).length;
  const createdPrevious = quizzes.filter((q) => inWindow(q.createdAt, previousFrom, currentFrom)).length;

  const finished = sessions.filter((s): s is QuizSession & { finishedAt: number } => typeof s.finishedAt === 'number');
  const currentSessions = finished.filter((s) => inWindow(s.finishedAt, currentFrom, now));
  const previousSessions = finished.filter((s) => inWindow(s.finishedAt, previousFrom, currentFrom));

  const accuracyOf = (list: QuizSession[]): number | null => {
    const total = list.reduce((sum, s) => sum + s.total, 0);
    if (total <= 0) return null;
    const score = list.reduce((sum, s) => sum + s.score, 0);
    return (score / total) * 100;
  };

  const currentAccuracy = accuracyOf(currentSessions);
  const previousAccuracy = accuracyOf(previousSessions);

  const currentTime = currentSessions.reduce((sum, s) => sum + sessionDurationMs(s), 0);
  const previousTime = previousSessions.reduce((sum, s) => sum + sessionDurationMs(s), 0);

  return {
    quizzes: percentChange(createdCurrent, createdPrevious, 2),
    accuracy: currentAccuracy !== null && previousAccuracy !== null
      ? Math.round(currentAccuracy - previousAccuracy)
      : null,
    studyTime: percentChange(currentTime, previousTime, 10 * 60_000),
  };
}
