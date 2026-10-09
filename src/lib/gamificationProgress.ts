/**
 * Real progress behind the gamification screen.
 *
 * Everything here is derived from what the user actually did. The screen used to
 * describe one thing and measure another — a "100 anatomy quizzes at 90%" badge
 * that counted every question of any subject, a "help 10 colleagues" badge for a
 * feature that does not exist, and a weekly *rank* in a single-user app. Numbers
 * shown next to a claim have to be that claim.
 */
import type { Quiz, QuestionStat, QuizSession } from '../types';
import { localDateStr } from './studyPlan';

const MINUTE_MS = 60_000;

/** Local midnight of the first day of the 7-day calendar window that ends today (the same window the day chart uses). */
function weekStartMs(now: number): number {
  const base = new Date(now);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - 6).getTime();
}

/** Study activity needed for one level. */
export const LEVEL_STEP = 4;
/** A session only counts as "impeccable" with at least this many questions (a 1/1 is luck, not mastery). */
export const PERFECT_MIN_QUESTIONS = 5;
/** A day with fewer answers than this says little about accuracy; the chart fades it. */
export const RELIABLE_DAY_MIN_QUESTIONS = 5;
/** "Best day" needs a real sample, otherwise one lucky 1/1 would win for ever. */
export const BEST_DAY_MIN_QUESTIONS = 10;
/** One session left open overnight must not count as eight hours of study. */
export const SESSION_MINUTES_CAP = 45;
/** A session counts toward the weekly rhythm only with at least this many questions (opening and closing a quiz is not a session). */
export const MIN_QUESTIONS_FOR_RHYTHM = 5;

/** Category used for quizzes without a subject; it is not a subject one can master. */
const UNCLASSIFIED = 'Neclasificate';

/* ---------------------------------------------------------------- level */

export interface LevelInfo {
  level: number;
  /** Quizzes + sessions + longest streak. */
  activity: number;
  /** Activity already collected toward the next level (0 to LEVEL_STEP - 1). */
  intoLevel: number;
  /** Activity still missing for the next level. */
  toNext: number;
  /** 0-100. */
  progress: number;
}

function clean(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * The one level formula, shared by the Realizări page and the app shell:
 * `floor((quizzes + sessions + longestStreak) / 4) + 1`.
 */
export function computeStudyLevel(input: { quizCount: number; sessionCount: number; longestStreak: number }): LevelInfo {
  const activity = clean(input.quizCount) + clean(input.sessionCount) + clean(input.longestStreak);
  const intoLevel = activity % LEVEL_STEP;
  return {
    level: Math.floor(activity / LEVEL_STEP) + 1,
    activity,
    intoLevel,
    toNext: LEVEL_STEP - intoLevel,
    progress: intoLevel * (100 / LEVEL_STEP),
  };
}

/* ---------------------------------------------------------------- mastery */

export interface CategoryMastery {
  category: string;
  /** Questions in this category the user has actually attempted. */
  answeredQuestions: number;
  /** Accuracy over those attempts, 0-100. */
  accuracy: number;
}

/**
 * Per-category mastery, strongest first. Categories are the quiz's own subject
 * label, so "anatomy progress" finally means questions from anatomy quizzes.
 */
export function computeCategoryMastery(
  quizzes: Quiz[],
  questionStats: Record<string, QuestionStat>,
): CategoryMastery[] {
  const totals = new Map<string, { answered: number; correct: number; attempts: number }>();

  for (const quiz of quizzes) {
    const category = (quiz.category ?? '').trim() || UNCLASSIFIED;
    for (const question of quiz.questions ?? []) {
      const stat = questionStats[`${quiz.id}:${question.id}`];
      // Retired history was copied onto the chapter decks: counting both would count every answer twice.
      if (!stat || stat.retired) continue;
      const attempts = (stat.timesCorrect || 0) + (stat.timesWrong || 0);
      if (!(attempts > 0)) continue;

      const entry = totals.get(category) ?? { answered: 0, correct: 0, attempts: 0 };
      entry.answered += 1;
      entry.correct += stat.timesCorrect || 0;
      entry.attempts += attempts;
      totals.set(category, entry);
    }
  }

  return [...totals.entries()]
    .map(([category, entry]) => ({
      category,
      answeredQuestions: entry.answered,
      accuracy: entry.attempts > 0 ? Math.round((entry.correct / entry.attempts) * 100) : 0,
    }))
    .sort((a, b) => b.answeredQuestions - a.answeredQuestions);
}

export interface MasteryProgress {
  /** The subject holding the required accuracy with the most answered questions, if any. */
  category: string | null;
  answeredQuestions: number;
  /**
   * The subject with the most answered questions, whatever its accuracy (ties go to
   * the higher accuracy). A locked badge shows its bar and its hint for this one
   * subject, so the two can never describe different subjects.
   */
  nearest: CategoryMastery | null;
}

function moreAdvanced(candidate: CategoryMastery, current: CategoryMastery | null): boolean {
  if (!current) return true;
  if (candidate.answeredQuestions !== current.answeredQuestions) return candidate.answeredQuestions > current.answeredQuestions;
  return candidate.accuracy > current.accuracy;
}

/**
 * Progress toward mastering any one subject. `category` is the furthest-along
 * subject that *also* holds the required accuracy (counting subjects the user is
 * failing would make the badge meaningless); `nearest` is the furthest-along
 * subject overall. "Neclasificate" is not a subject at all.
 */
export function masteryProgress(mastery: CategoryMastery[], requiredAccuracy = 90): MasteryProgress {
  let qualifying: CategoryMastery | null = null;
  let nearest: CategoryMastery | null = null;
  for (const entry of mastery) {
    if (entry.category === UNCLASSIFIED) continue;
    if (entry.accuracy >= requiredAccuracy && moreAdvanced(entry, qualifying)) qualifying = entry;
    if (moreAdvanced(entry, nearest)) nearest = entry;
  }
  if (!qualifying) return { category: null, answeredQuestions: 0, nearest };
  return { category: qualifying.category, answeredQuestions: qualifying.answeredQuestions, nearest };
}

/**
 * Sets the user made or imported: no archived ones, no automatic mixed-session
 * sets (`folder-session:*`) and nothing from the built-in Rezidențiat bank.
 */
export function countOwnSets(quizzes: (Pick<Quiz, 'archived' | 'tags'> & { id?: string })[]): number {
  // The tag test mirrors isRezidentiatQuiz (rezidentiatBank.ts), repeated here so this module stays free of store imports.
  const generated = (tag: string) => tag === 'rezidentiat' || tag.startsWith('rezidentiat-bank:') || tag.startsWith('folder-session:');
  // A set split into chapter decks (`<id>--ch3`) is archived and its chapter decks carry the `rezidentiat` tag: it is still ONE set the
  // user made, so the split must neither remove it from the count nor add the chapters to it.
  const splitSources = new Set<string>();
  for (const quiz of quizzes) {
    const cut = quiz.id ? quiz.id.indexOf('--') : -1;
    if (cut > 0 && quiz.id) splitSources.add(quiz.id.slice(0, cut));
  }
  return quizzes.filter((quiz) => {
    if ((quiz.tags ?? []).some(generated)) return false;
    return !quiz.archived || (!!quiz.id && splitSources.has(quiz.id));
  }).length;
}

/** Accuracy over every recorded attempt; `null` (not 0) when nothing was attempted yet. */
export function overallAccuracy(questionStats: Record<string, QuestionStat>): { accuracy: number | null; attempts: number } {
  let correct = 0;
  let attempts = 0;
  for (const stat of Object.values(questionStats)) {
    if (stat.retired) continue;
    correct += stat.timesCorrect || 0;
    attempts += (stat.timesCorrect || 0) + (stat.timesWrong || 0);
  }
  return { accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null, attempts };
}

/* ---------------------------------------------------------------- sessions */

/** Finished sessions of the last 7 calendar days (today included) with at least `minQuestions` questions. */
export function sessionsThisWeek(sessions: QuizSession[], now: number = Date.now(), minQuestions = 1): number {
  const start = weekStartMs(now);
  return sessions.filter(
    (session) =>
      typeof session.finishedAt === 'number'
      && session.finishedAt >= start
      && Number.isFinite(session.total)
      && session.total >= minQuestions,
  ).length;
}

/**
 * Minutes of quiz sessions in the last 7 calendar days, from `finishedAt - startedAt`,
 * with each session capped so a tab left open does not count as study.
 */
export function studyMinutesThisWeek(
  sessions: QuizSession[],
  now: number = Date.now(),
  capMin: number = SESSION_MINUTES_CAP,
): number {
  const start = weekStartMs(now);
  let total = 0;
  for (const session of sessions) {
    if (typeof session.finishedAt !== 'number' || session.finishedAt < start) continue;
    const minutes = (session.finishedAt - session.startedAt) / MINUTE_MS;
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    total += Math.min(minutes, capMin);
  }
  return Math.round(total);
}

/** Sessions where every question was answered correctly (and there were enough questions for that to mean something). */
export function perfectSessionCount(sessions: QuizSession[], minQuestions = 1): number {
  return sessions.filter(
    (session) => session.total > 0 && session.total >= minQuestions && session.score === session.total,
  ).length;
}

/* ---------------------------------------------------------------- streak */

/** Longest run of consecutive study days actually recorded. */
export function bestStreak(currentStreak: number, longestStreak: number): number {
  return Math.max(currentStreak, longestStreak);
}

function previousDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d - 1));
}

/**
 * The streak as it stands today. `currentStreak` is only recalculated when a
 * study session is recorded, so after a skipped day it stays at the old number;
 * a streak is alive only if the last study day is today or yesterday.
 */
export function effectiveStreak(streak: { currentStreak: number; lastStudyDate: string }, today: string): number {
  if (!streak.lastStudyDate) return 0;
  if (streak.lastStudyDate !== today && streak.lastStudyDate !== previousDay(today)) return 0;
  return clean(streak.currentStreak);
}

/* ---------------------------------------------------------------- points */

/** What each kind of activity is worth in the single activity total. */
export const POINT_WEIGHTS = { set: 20, session: 35, perfectSession: 80, studyDay: 25 } as const;

/** The single activity total: 20 per set, 35 per session, 80 per impeccable session, 25 per study day. */
export function activityPoints(input: {
  quizCount: number;
  sessionCount: number;
  perfectSessions: number;
  studyDays: number;
}): number {
  return (
    POINT_WEIGHTS.set * clean(input.quizCount)
    + POINT_WEIGHTS.session * clean(input.sessionCount)
    + POINT_WEIGHTS.perfectSession * clean(input.perfectSessions)
    + POINT_WEIGHTS.studyDay * clean(input.studyDays)
  );
}

/* ---------------------------------------------------------------- self comparison */

export interface DayAccuracy {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Weighted by questions; `null` for a day with no answers (not 0%). */
  accuracy: number | null;
  correct: number;
  questions: number;
}

interface DayTotals { correct: number; total: number }

function sessionDayTotals(sessions: QuizSession[]): Map<string, DayTotals> {
  const byDay = new Map<string, DayTotals>();
  for (const session of sessions) {
    // Only finished sessions: an unfinished one has no meaningful score.
    const ts = session.finishedAt;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || !(session.total > 0) || !Number.isFinite(session.score)) continue;
    const key = localDateStr(new Date(ts));
    const entry = byDay.get(key) ?? { correct: 0, total: 0 };
    entry.correct += Math.max(0, Math.min(session.score, session.total));
    entry.total += session.total;
    byDay.set(key, entry);
  }
  return byDay;
}

function toDayAccuracy(date: string, entry: DayTotals | undefined): DayAccuracy {
  if (!entry || entry.total <= 0) return { date, accuracy: null, correct: 0, questions: 0 };
  return { date, accuracy: Math.round((entry.correct / entry.total) * 100), correct: entry.correct, questions: entry.total };
}

/**
 * Accuracy per local calendar day for the last `days` days, oldest first, today
 * last. Days are local (not UTC) and weighted by question count, so 9/10 plus
 * 1/30 in one day is 25%, not the 50% an average of the two percentages gives.
 */
export function dailyAccuracy(sessions: QuizSession[], now: number = Date.now(), days = 7): DayAccuracy[] {
  const byDay = sessionDayTotals(sessions);
  const base = new Date(now);
  const result: DayAccuracy[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = localDateStr(new Date(base.getFullYear(), base.getMonth(), base.getDate() - i));
    result.push(toDayAccuracy(date, byDay.get(date)));
  }
  return result;
}

/** Percentage points between two days, or `null` when either has no data (nothing honest to compare). */
export function compareDays(today: number | null, yesterday: number | null): number | null {
  if (today === null || yesterday === null) return null;
  return today - yesterday;
}

/** The best day with at least `minQuestions` answers; more questions win ties, then the more recent day. */
export function bestDay(
  sessions: QuizSession[],
  minQuestions: number = BEST_DAY_MIN_QUESTIONS,
): DayAccuracy | null {
  let best: DayAccuracy | null = null;
  for (const [date, entry] of sessionDayTotals(sessions)) {
    if (entry.total < minQuestions) continue;
    const day = toDayAccuracy(date, entry);
    if (day.accuracy === null) continue;
    if (
      !best
      || day.accuracy > (best.accuracy ?? -1)
      || (day.accuracy === best.accuracy && (day.questions > best.questions || (day.questions === best.questions && day.date > best.date)))
    ) {
      best = day;
    }
  }
  return best;
}

export interface SelfComparison {
  /** Last 7 days, oldest first. */
  days: DayAccuracy[];
  today: DayAccuracy;
  yesterday: DayAccuracy;
  /** Accuracy over the whole window, weighted by questions. */
  week: { accuracy: number | null; questions: number };
  best: DayAccuracy | null;
  /** Today minus yesterday in percentage points, or `null` without data on both days. */
  delta: number | null;
}

export function buildSelfComparison(sessions: QuizSession[], now: number = Date.now()): SelfComparison {
  const days = dailyAccuracy(sessions, now, 7);
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const correct = days.reduce((sum, day) => sum + day.correct, 0);
  const questions = days.reduce((sum, day) => sum + day.questions, 0);
  return {
    days,
    today,
    yesterday,
    week: { accuracy: questions > 0 ? Math.round((correct / questions) * 100) : null, questions },
    best: bestDay(sessions),
    delta: compareDays(today.accuracy, yesterday.accuracy),
  };
}
