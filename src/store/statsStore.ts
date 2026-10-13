import { create } from 'zustand';
import type { Confidence, QuestionStat, StudyStreak } from '../types';
import { localDateStr } from '../lib/studyPlan';
import { emptyAchievements, normalizeAchievements, type AchievementsState } from '../lib/gamificationAchievements';

const EMPTY_STREAK: StudyStreak = {
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: '',
  studyDates: [],
};

interface StatsStore {
  questionStats: Record<string, QuestionStat>;
  streak: StudyStreak;
  totalStudyTime: number;
  /** Realizări câștigate definitiv + reperele nivelului; se salvează odată cu statisticile (câmp opțional în snapshot). */
  achievements: AchievementsState;
  setAchievements: (next: AchievementsState) => void;
  recordAnswer: (quizId: string, questionId: string, correct: boolean, confidence?: Confidence, opts?: { flashcard?: boolean }) => void;
  recordStudySession: (durationSeconds: number) => void;
  getDueQuestions: () => QuestionStat[];
  getWeakQuestions: (limit?: number, validKeys?: ReadonlySet<string>) => QuestionStat[];
  getAccuracy: (quizId?: string) => number;
  getStatsByTag: (quizzes: import('../types').Quiz[]) => Record<string, { correct: number; total: number }>;
  /** `achievements` lipsește din profilurile salvate înainte de realizările definitive: se citește ca „nimic înregistrat”. */
  _hydrate: (data: { questionStats: Record<string, QuestionStat>; streak: StudyStreak; totalStudyTime: number; achievements?: unknown }) => void;
  _snapshot: () => { questionStats: Record<string, QuestionStat>; streak: StudyStreak; totalStudyTime: number; achievements: AchievementsState };
  reset: () => void;
}

function getToday(): string {
  return localDateStr();
}

type SM2Quality = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Map the answer outcome + self-assessed confidence to an SM-2 quality grade.
 *
 *   blackout            → 0  (always a lapse, even if the answer was correct)
 *   guess     + wrong   → 1
 *   confident + wrong   → 2
 *   guess     + correct → 3
 *   (no rating)+ correct → 4
 *   confident + correct → 5
 *   (no rating)+ wrong  → 1
 */
function qualityFromOutcome(correct: boolean, confidence?: Confidence): SM2Quality {
  if (confidence === 'blackout') return 0;
  if (!correct) return confidence === 'confident' ? 2 : 1;
  if (confidence === 'confident') return 5;
  if (confidence === 'guess') return 3;
  return 4; // correct, no explicit rating
}

/**
 * SuperMemo-2 (SM-2) algorithm, quality-driven (Anki/professional SRS).
 * `consecutiveCorrect` plays the role of SM-2 "repetitions".
 */
/** „Greu” la un flashcard: se reia în aceeași sesiune și rămâne scadent după atât. */
export const FLASHCARD_RELEARN_MS = 10 * 60 * 1000;

export function calcNextReview(
  stat: QuestionStat,
  correct: boolean,
  confidence?: Confidence,
  opts?: { flashcard?: boolean },
): { nextReview: number; interval: number; eFactor: number; consecutiveCorrect: number } {
  const quality = qualityFromOutcome(correct, confidence);
  const eFactor = stat.eFactor ?? 2.5;
  const interval = stat.interval ?? 0;
  const n = stat.consecutiveCorrect ?? 0;

  if (quality < 3) {
    // Lapse: restart the learning phase. SM-2 spec (and Anki) penalise the ease
    // factor on every lapse so that genuinely hard cards stay at short intervals
    // after relearning instead of jumping back to months straight away.
    return {
      // O grilă greșită revine mâine; un flashcard „Greu” se reia în câteva minute.
      nextReview: Date.now() + (opts?.flashcard ? FLASHCARD_RELEARN_MS : 86400000),
      interval: 1,
      eFactor: Math.max(1.3, eFactor - 0.2),
      consecutiveCorrect: 0,
    };
  }

  // Standard SM-2 ease-factor update from the quality grade.
  const newEF = Math.max(1.3, eFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  let newInterval: number;
  // Prima trecere: „Bine” = 1 zi, „Ușor” (siguranță deplină) = 4 zile, ca să difere de la început.
  if (n === 0) newInterval = quality >= 5 ? 4 : 1;
  else if (n === 1) newInterval = 6;
  // A stat carrying interval 0 (legacy or partially hydrated data) would stay at
  // 0 forever here, since 0 * eFactor is still 0 — leaving the card due on every
  // single review, permanently. The floor of one day keeps it moving.
  else newInterval = Math.max(1, Math.round(interval * newEF));

  // Cap la 1 an pentru studenți la medicină (memorie pe termen lung)
  newInterval = Math.min(newInterval, 365);

  return {
    nextReview: Date.now() + newInterval * 86400000,
    interval: newInterval,
    eFactor: newEF,
    consecutiveCorrect: n + 1,
  };
}

/** Scadentă: programată și ajunsă la termen; intrările retrase nu mai contează. */
export function isDueStat(stat: QuestionStat, now: number = Date.now()): boolean {
  return !stat.retired && stat.nextReview > 0 && stat.nextReview <= now;
}

/**
 * „Slabă” = greșită cel puțin o dată și încă nestabilizată (ease scăzut sau sub 2 răspunsuri corecte la rând).
 * O întrebare la care ai răspuns doar corect nu e slabă, chiar dacă încă nu s-a stabilizat.
 */
export function isWeakStat(stat: QuestionStat): boolean {
  if (stat.retired || stat.timesWrong <= 0) return false;
  return (stat.eFactor ?? 2.5) < 2.0 || (stat.consecutiveCorrect ?? 0) < 2;
}

/** Cheia `${quizId}:${questionId}` pentru fiecare întrebare existentă; statisticile fără cheie (set șters) sunt orfane. */
export function existingStatKeys(quizzes: ReadonlyArray<Pick<import('../types').Quiz, 'id' | 'questions'>>): Set<string> {
  const keys = new Set<string>();
  for (const quiz of quizzes) for (const q of quiz.questions) keys.add(`${quiz.id}:${q.id}`);
  return keys;
}

/** Numără exact întrebările slabe (fără limită); `validKeys` exclude statisticile orfane. */
export function countWeakStats(stats: Record<string, QuestionStat>, validKeys?: ReadonlySet<string>): number {
  let count = 0;
  for (const [key, stat] of Object.entries(stats)) {
    if (validKeys && !validKeys.has(key)) continue;
    if (isWeakStat(stat)) count += 1;
  }
  return count;
}

/** Acuratețea (0–100) pe fiecare set, dintr-o singură trecere prin statistici; istoricul retras nu se numără. */
export function accuracyByQuiz(questionStats: Record<string, QuestionStat>): Map<string, number> {
  const totals = new Map<string, { correct: number; total: number }>();
  for (const stat of Object.values(questionStats)) {
    if (stat.retired) continue;
    const row = totals.get(stat.quizId) ?? { correct: 0, total: 0 };
    row.correct += stat.timesCorrect;
    row.total += stat.timesCorrect + stat.timesWrong;
    totals.set(stat.quizId, row);
  }
  const out = new Map<string, number>();
  for (const [quizId, { correct, total }] of totals) out.set(quizId, total > 0 ? Math.round((correct / total) * 100) : 0);
  return out;
}

export const useStatsStore = create<StatsStore>()(
  (set, get) => ({
    questionStats: {},
    streak: { ...EMPTY_STREAK },
    totalStudyTime: 0,
    achievements: emptyAchievements(),

    setAchievements: (next) => set({ achievements: next }),

    recordAnswer: (quizId, questionId, correct, confidence, opts) => {
      const key = `${quizId}:${questionId}`;
      set((s) => {
        const existing: QuestionStat = s.questionStats[key] ?? {
          questionId, quizId,
          timesCorrect: 0, timesWrong: 0,
          lastSeen: 0, nextReview: 0, interval: 0, eFactor: 2.5,
          consecutiveCorrect: 0,
        };

        const review = calcNextReview(existing, correct, confidence, opts);

        const updated: QuestionStat = {
          ...existing,
          timesCorrect: existing.timesCorrect + (correct ? 1 : 0),
          timesWrong: existing.timesWrong + (correct ? 0 : 1),
          lastSeen: Date.now(),
          nextReview: review.nextReview,
          interval: review.interval,
          eFactor: review.eFactor,
          consecutiveCorrect: review.consecutiveCorrect,
          ...(confidence ? { lastConfidence: confidence } : {}),
        };

        return { questionStats: { ...s.questionStats, [key]: updated } };
      });
    },

    recordStudySession: (durationSeconds) => {
      const today = getToday();
      set((s) => {
        const dates = s.streak.studyDates;
        if (dates.includes(today)) {
          return { totalStudyTime: s.totalStudyTime + durationSeconds };
        }
        const newDates = [...dates, today].sort();
        
        // Accurate consecutive days streak calculation
        let current = 0;
        const [ty, tm, td] = today.split('-').map(Number);
        const checkDate = new Date(ty, tm - 1, td); // local midnight (new Date('YYYY-MM-DD') e UTC)
        
        while (true) {
          const dateStr = localDateStr(checkDate);
          if (newDates.includes(dateStr)) {
            current++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }

        return {
          totalStudyTime: s.totalStudyTime + durationSeconds,
          streak: {
            currentStreak: current,
            longestStreak: Math.max(s.streak.longestStreak, current),
            lastStudyDate: today,
            studyDates: newDates.slice(-365),
          },
        };
      });
    },

    getDueQuestions: () => {
      const now = Date.now();
      return Object.values(get().questionStats).filter((s) => isDueStat(s, now));
    },

    getWeakQuestions: (limit = 10, validKeys) => {
      // Slabă = greșită măcar o dată și nestabilizată (vezi `isWeakStat`); fără întrebări slabe, lista e goală.
      const pool = Object.entries(get().questionStats)
        .filter(([key, s]) => (!validKeys || validKeys.has(key)) && isWeakStat(s))
        .map(([, s]) => s);
      return pool
        .sort((a, b) => {
          const efA = a.eFactor ?? 2.5;
          const efB = b.eFactor ?? 2.5;
          if (efA !== efB) return efA - efB; // weakest ease factor first
          const totalA = a.timesCorrect + a.timesWrong;
          const totalB = b.timesCorrect + b.timesWrong;
          const accA = a.timesCorrect / totalA;
          const accB = b.timesCorrect / totalB;
          if (accA !== accB) return accA - accB;
          return totalB - totalA;
        })
        .slice(0, limit);
    },

    getAccuracy: (quizId) => {
      const stats = Object.values(get().questionStats).filter(
        (s) => (!quizId || s.quizId === quizId) && !s.retired
      );
      if (!stats.length) return 0;
      const total = stats.reduce((a, s) => a + s.timesCorrect + s.timesWrong, 0);
      const correct = stats.reduce((a, s) => a + s.timesCorrect, 0);
      return total > 0 ? Math.round((correct / total) * 100) : 0;
    },

    getStatsByTag: (quizzes) => {
      const stats = get().questionStats;
      const result: Record<string, { correct: number; total: number }> = {};
      quizzes.forEach(quiz => {
        // Un pachet arhivat (ex. cel împărțit pe capitole) are istoricul copiat pe pachetele noi: nu se numără de două ori.
        if (quiz.archived) return;
        // Etichetele de structură (chapter:3, book:K) nu sunt subiecte de învățat.
        const quizTags = (quiz.tags ?? []).filter((tag) => !/^(chapter|book):/.test(tag));
        quiz.questions.forEach(q => {
          const key = `${quiz.id}:${q.id}`;
          const s = stats[key];
          if (!s) return;
          // Per-question tags are the real topic granularity (that's what every other
          // weak-topic calculation in the app uses) — quiz-level tags were shadowing them
          // entirely, so a quiz without its own `tags` counted for nothing here even when
          // every question inside it was properly tagged.
          const tags = q.tags?.length ? q.tags : quizTags;
          tags.forEach(tag => {
            if (!result[tag]) result[tag] = { correct: 0, total: 0 };
            result[tag].correct += s.timesCorrect;
            result[tag].total += s.timesCorrect + s.timesWrong;
          });
        });
      });
      return result;
    },

    _hydrate: (data) => set({
      questionStats: data.questionStats ?? {},
      streak: data.streak ?? { ...EMPTY_STREAK },
      totalStudyTime: data.totalStudyTime ?? 0,
      achievements: normalizeAchievements(data.achievements),
    }),
    _snapshot: () => ({
      questionStats: get().questionStats,
      streak: get().streak,
      totalStudyTime: get().totalStudyTime,
      achievements: get().achievements,
    }),
    reset: () => set({
      questionStats: {},
      streak: { ...EMPTY_STREAK },
      totalStudyTime: 0,
      achievements: emptyAchievements(),
    }),
  })
);
