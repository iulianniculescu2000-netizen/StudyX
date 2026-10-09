/**
 * What the Realizări page offers, as plain data: the four achievements, the three
 * challenges, their Romanian labels and the progress model behind each bar.
 * No JSX and no colours here — components pick those from the theme.
 */
import { Activity, Award, BadgeCheck, Flame, Library, Target, Timer, Trophy, type LucideIcon } from 'lucide-react';
import {
  MIN_QUESTIONS_FOR_RHYTHM,
  PERFECT_MIN_QUESTIONS,
  SESSION_MINUTES_CAP,
  type MasteryProgress,
} from '../../lib/gamificationProgress';
import type { EarnedRecord } from '../../lib/gamificationAchievements';

/* ---------------------------------------------------------------- labels */

export const RARITY_LABELS = {
  common: 'Comună',
  rare: 'Rară',
  epic: 'Epică',
  legendary: 'Legendară',
} as const;
export type Rarity = keyof typeof RARITY_LABELS;

export const CATEGORY_LABELS = {
  study: 'Studiu',
  performance: 'Performanță',
  milestone: 'Reper',
} as const;
export type AchievementCategory = keyof typeof CATEGORY_LABELS;

export const DIFFICULTY_LABELS = {
  easy: 'Ușor',
  medium: 'Mediu',
  hard: 'Dificil',
  expert: 'Expert',
} as const;
export type Difficulty = keyof typeof DIFFICULTY_LABELS;

export const CHALLENGE_KIND_LABELS = {
  week: 'Ultimele 7 zile',
  streak: 'Serie',
} as const;
export type ChallengeKind = keyof typeof CHALLENGE_KIND_LABELS;

export const UNIT_LABELS = {
  questions: 'întrebări',
  sessions: 'sesiuni',
  minutes: 'minute',
  days: 'zile',
  sets: 'seturi',
} as const;
export type Unit = keyof typeof UNIT_LABELS;

export const TAB_LABELS = {
  achievements: 'Realizări',
  challenges: 'Provocări',
  self: 'Tu vs. tine',
} as const;
export type GamificationTab = keyof typeof TAB_LABELS;

/** Order and icons of the page tabs. */
export const TAB_ITEMS: readonly { id: GamificationTab; label: string; icon: LucideIcon }[] = [
  { id: 'achievements', label: TAB_LABELS.achievements, icon: Award },
  { id: 'challenges', label: TAB_LABELS.challenges, icon: Target },
  { id: 'self', label: TAB_LABELS.self, icon: Activity },
];

/* ---------------------------------------------------------------- progress model */

export interface Progress {
  id: string;
  current: number;
  target: number;
  unit: Unit;
  done: boolean;
  /** 0-100, never above 100. */
  percent: number;
}

function progress(id: string, rawCurrent: number, target: number, unit: Unit, done?: boolean): Progress {
  const current = Math.min(target, Math.max(0, Number.isFinite(rawCurrent) ? Math.round(rawCurrent) : 0));
  return {
    id,
    current,
    target,
    unit,
    done: done ?? current >= target,
    percent: Math.round(Math.min(1, current / target) * 100),
  };
}

export interface GamificationMetrics {
  /** Sets (quizzes or decks) the user made or imported, see countOwnSets. */
  quizCount: number;
  /** Finished sessions with every answer right and at least PERFECT_MIN_QUESTIONS questions. */
  perfectSessions: number;
  /** max(current, longest) streak, for the "week of study" achievement. */
  bestStreak: number;
  /** The streak that is still alive today (0 after a skipped day). */
  liveStreak: number;
  mastery: MasteryProgress;
  /** Quiz sessions finished in the last 7 days with at least MIN_QUESTIONS_FOR_RHYTHM questions. */
  sessionsThisWeek: number;
  studyMinutesThisWeek: number;
}

export const EMPTY_METRICS: GamificationMetrics = {
  quizCount: 0,
  perfectSessions: 0,
  bestStreak: 0,
  liveStreak: 0,
  mastery: { category: null, answeredQuestions: 0, nearest: null },
  sessionsThisWeek: 0,
  studyMinutesThisWeek: 0,
};

/* ---------------------------------------------------------------- achievements */

export const MASTERY_QUESTIONS = 100;
export const MASTERY_ACCURACY = 90;
export const BANK_SETS = 10;
export const STREAK_WEEK_DAYS = 7;
export const PERFECT_SESSIONS = 50;

/**
 * Said in every achievement's "Cum se măsoară": progresul se recalculează, dar o realizare îndeplinită
 * se înregistrează și rămâne câștigată.
 */
export const LIVE_STATE_NOTE =
  'Progresul se recalculează din datele curente, dar o realizare odată câștigată rămâne câștigată definitiv, cu data ei, chiar dacă ștergi, arhivezi sau împarți seturile.';

export interface Achievement extends Progress {
  title: string;
  description: string;
  icon: LucideIcon;
  rarity: Rarity;
  category: AchievementCategory;
  /** "Cum se măsoară" in the detail view. */
  how: string;
  /** Extra line shown while locked: how close the user is, for the same subject the bar counts. */
  hint?: string;
  /** Set once the achievement was recorded as won for good; carries the date. */
  earned?: EarnedRecord;
}

/**
 * Overlays the recorded wins on the live progress: a recorded achievement stays done (full bar, the title it was
 * won with) whatever the current data says; one that is only live-done is shown as done too and gets recorded
 * by the watcher a moment later.
 */
export function applyEarned(achievements: Achievement[], earned: Record<string, EarnedRecord>): Achievement[] {
  return achievements.map((item) => {
    const record = earned[item.id];
    if (!record) return item;
    return {
      ...item,
      done: true,
      current: item.target,
      percent: 100,
      title: record.title ?? item.title,
      hint: undefined,
      earned: record,
    };
  });
}

/**
 * The line under a locked subject badge. It describes the subject the bar counts
 * (`mastery.nearest`), caps the questions at the target and says what is missing.
 */
export function masteryHint(mastery: MasteryProgress): string | undefined {
  const near = mastery.nearest;
  if (!near) return undefined;
  const shown = Math.min(near.answeredQuestions, MASTERY_QUESTIONS);
  const missingQuestions = MASTERY_QUESTIONS - shown;
  const missingAccuracy = near.accuracy < MASTERY_ACCURACY;
  const base = `${near.category}: ${shown}/${MASTERY_QUESTIONS} întrebări, acuratețe ${near.accuracy}%`;
  if (missingQuestions > 0 && missingAccuracy) {
    return `${base} (mai trebuie ${missingQuestions} întrebări și ${MASTERY_ACCURACY}% acuratețe)`;
  }
  if (missingAccuracy) return `${base}: mai trebuie ${MASTERY_ACCURACY}%`;
  return `${base} (mai trebuie ${missingQuestions} ${missingQuestions === 1 ? 'întrebare' : 'întrebări'})`;
}

export function buildAchievements(metrics: GamificationMetrics): Achievement[] {
  const { mastery: m } = metrics;
  const mastered = m.category !== null && m.answeredQuestions >= MASTERY_QUESTIONS;
  // Unlocked: the subject that holds the accuracy. Locked: the furthest-along subject, for the bar and the hint alike.
  const masteryCount = mastered ? m.answeredQuestions : (m.nearest?.answeredQuestions ?? 0);
  const mastery = progress('mastery', masteryCount, MASTERY_QUESTIONS, 'questions', mastered);
  const bank = progress('bank', metrics.quizCount, BANK_SETS, 'sets');
  const week = progress('week', metrics.bestStreak, STREAK_WEEK_DAYS, 'days');
  const perfect = progress('perfect', metrics.perfectSessions, PERFECT_SESSIONS, 'sessions');

  return [
    {
      ...mastery,
      title: mastered ? `Maestru — ${m.category}` : 'Maestru pe o materie',
      description: `Răspunde la ${MASTERY_QUESTIONS} de întrebări dintr-o singură materie, păstrând cel puțin ${MASTERY_ACCURACY}% acuratețe.`,
      icon: Trophy,
      rarity: 'legendary',
      category: 'study',
      how: `Întrebările la care ai răspuns din materia cu cele mai multe răspunsuri; se deblochează doar dacă acuratețea ei e de cel puțin ${MASTERY_ACCURACY}%. „Neclasificate” nu contează ca materie. ${LIVE_STATE_NOTE}`,
      hint: mastered ? undefined : masteryHint(m),
    },
    {
      ...bank,
      title: 'Constructor de bancă',
      description: `Creează sau importă ${BANK_SETS} seturi (grile sau carduri).`,
      icon: Library,
      rarity: 'epic',
      category: 'milestone',
      how: `Seturi create sau importate de tine. Nu intră seturile arhivate, sesiunile mixte generate automat și banca Rezidențiat din aplicație. ${LIVE_STATE_NOTE}`,
    },
    {
      ...week,
      title: 'Săptămâna de studiu',
      description: `Atinge ${STREAK_WEEK_DAYS} zile consecutive de studiu.`,
      icon: Flame,
      rarity: 'rare',
      category: 'milestone',
      how: `Cea mai lungă serie de zile consecutive de studiu înregistrată. ${LIVE_STATE_NOTE}`,
    },
    {
      ...perfect,
      title: 'Sesiuni impecabile',
      description: `Termină ${PERFECT_SESSIONS} de sesiuni cu toate răspunsurile corecte (minim ${PERFECT_MIN_QUESTIONS} întrebări).`,
      icon: BadgeCheck,
      rarity: 'legendary',
      category: 'performance',
      how: `Sesiuni de grile încheiate fără nicio greșeală, cu cel puțin ${PERFECT_MIN_QUESTIONS} întrebări fiecare. ${LIVE_STATE_NOTE}`,
    },
  ];
}

/* ---------------------------------------------------------------- challenges */

export const WEEKLY_SESSIONS = 10;
export const MARATHON_MINUTES = 75;
export const DAILY_STREAK_DAYS = 5;

export interface Challenge extends Progress {
  title: string;
  description: string;
  /** What exactly is counted, shown on the card. */
  how: string;
  icon: LucideIcon;
  difficulty: Difficulty;
  kind: ChallengeKind;
  /** Where the "Începe provocarea" link goes. */
  to: '/quizzes' | '/daily-review';
}

export function buildChallenges(metrics: GamificationMetrics): Challenge[] {
  return [
    {
      ...progress('rhythm', metrics.sessionsThisWeek, WEEKLY_SESSIONS, 'sessions'),
      title: 'Ritm săptămânal',
      description: `Încheie ${WEEKLY_SESSIONS} sesiuni de grile în ultimele 7 zile.`,
      how: `Se numără doar sesiunile de grile încheiate în ultimele 7 zile, fiecare cu cel puțin ${MIN_QUESTIONS_FOR_RHYTHM} întrebări.`,
      icon: Target,
      difficulty: 'medium',
      kind: 'week',
      to: '/quizzes',
    },
    {
      ...progress('marathon', metrics.studyMinutesThisWeek, MARATHON_MINUTES, 'minutes'),
      title: 'Maraton de grile',
      description: `Adună ${MARATHON_MINUTES} de minute în sesiuni de grile, în ultimele 7 zile.`,
      how: `Se numără doar sesiunile de grile încheiate în ultimele 7 zile, cel mult ${SESSION_MINUTES_CAP} de minute dintr-o sesiune.`,
      icon: Timer,
      difficulty: 'hard',
      kind: 'week',
      to: '/quizzes',
    },
    {
      ...progress('streak', metrics.liveStreak, DAILY_STREAK_DAYS, 'days'),
      title: 'Serie zilnică',
      description: `Studiază ${DAILY_STREAK_DAYS} zile la rând.`,
      how: 'Zile consecutive cu orice sesiune de studiu înregistrată (grile, carduri, recapitulare). Seria revine la 0 dacă sari o zi.',
      icon: Flame,
      difficulty: 'easy',
      kind: 'streak',
      to: '/daily-review',
    },
  ];
}

/* ---------------------------------------------------------------- self comparison copy */

/**
 * The line above the comparison rows. A missing day is never treated as 0%:
 * with nothing to compare against, it says so instead of inventing a delta.
 */
export function comparisonMessage(
  today: number | null,
  yesterday: number | null,
): { tone: 'up' | 'down' | 'flat' | 'none'; text: string } {
  if (today === null) return { tone: 'none', text: 'Azi nu ai răspuns încă la întrebări.' };
  if (yesterday === null) return { tone: 'none', text: 'Ieri nu ai răspuns la întrebări, nu avem cu ce compara.' };
  const delta = today - yesterday;
  if (delta === 0) return { tone: 'flat', text: 'La fel ca ieri.' };
  const size = Math.abs(delta);
  const unit = size === 1 ? 'punct procentual' : 'puncte procentuale';
  return delta > 0
    ? { tone: 'up', text: `+${size} ${unit} față de ieri` }
    : { tone: 'down', text: `−${size} ${unit} față de ieri` };
}
