/**
 * Study activity per day, for the consistency map on the dashboard.
 *
 * Streaks tell you about today; they say nothing about the shape of the last
 * three months. A day grid does: a student sees at a glance that they study in
 * bursts before exams and go dark for two weeks after, which is the single
 * most useful thing this data can tell them.
 */
import type { QuizSession } from '../types';

export interface HeatmapDay {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Questions answered that day. */
  questions: number;
  /** 0 = nothing, 1-4 = increasing activity. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Day of week, Monday = 0, so columns line up as weeks. */
  weekday: number;
}

export interface HeatmapSummary {
  days: HeatmapDay[];
  activeDays: number;
  totalQuestions: number;
  bestDay: HeatmapDay | null;
  /** Longest run of consecutive active days inside the window. */
  bestRun: number;
}

/** Local date key — `toISOString` would shift days for anyone east of UTC. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Monday-first weekday index, because Romanian weeks start on Monday. */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function levelFor(questions: number, busiest: number): HeatmapDay['level'] {
  if (questions <= 0) return 0;
  // Relative to the student's own best day: an intense user and a light user
  // both get a readable gradient instead of everything saturating at the top.
  const ratio = questions / Math.max(busiest, 1);
  if (ratio > 0.66) return 4;
  if (ratio > 0.36) return 3;
  if (ratio > 0.15) return 2;
  return 1;
}

/**
 * Builds the grid for the last `weeks` weeks, ending today, padded so the first
 * column starts on a Monday.
 */
export function buildStudyHeatmap(
  sessions: QuizSession[],
  weeks = 18,
  now = Date.now(),
): HeatmapSummary {
  const perDay = new Map<string, number>();

  for (const session of sessions) {
    const at = session.finishedAt ?? session.startedAt;
    if (!at) continue;
    const answered = Object.keys(session.answers ?? {}).length || session.total || 0;
    if (answered <= 0) continue;
    const key = dayKey(at);
    perDay.set(key, (perDay.get(key) ?? 0) + answered);
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Walk back the requested window, then to that day's Monday so the grid
  // always starts on a full week column.
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  start.setDate(start.getDate() - weekdayIndex(start));

  const busiest = Math.max(0, ...perDay.values());
  const days: HeatmapDay[] = [];

  for (let cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor.getTime());
    const questions = perDay.get(key) ?? 0;
    days.push({
      date: key,
      questions,
      level: levelFor(questions, busiest),
      weekday: weekdayIndex(cursor),
    });
  }

  let bestRun = 0;
  let run = 0;
  for (const day of days) {
    run = day.questions > 0 ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }

  const activeDays = days.filter((day) => day.questions > 0).length;
  const totalQuestions = days.reduce((sum, day) => sum + day.questions, 0);
  const bestDay = days.reduce<HeatmapDay | null>(
    (best, day) => (day.questions > (best?.questions ?? 0) ? day : best),
    null,
  );

  return { days, activeDays, totalQuestions, bestDay, bestRun };
}

/** Groups days into week columns for rendering. */
export function toWeekColumns(days: HeatmapDay[]): HeatmapDay[][] {
  const columns: HeatmapDay[][] = [];
  let current: HeatmapDay[] = [];

  for (const day of days) {
    if (day.weekday === 0 && current.length > 0) {
      columns.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length > 0) columns.push(current);
  return columns;
}
