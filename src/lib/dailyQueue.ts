/**
 * „Azi de revăzut”: o singură coadă a zilei peste cardurile scadente, grilele scadente și greșelile din
 * caietul de erori. Pură și fără date noi: se reconstruiește oricând din pachete și statistici (SM-2).
 * Prioritate: întârzierea (zile) și acuratețea scăzută; plafon pe zi; sesiune „pe timp” (~15 min).
 */
import type { Question, QuestionStat, Quiz } from '../types';
import { buildDueItems } from './dueItems';
import { buildDueQueue } from './flashcardDueQueue';
import { buildErrorEntries } from './errorNotebook';

export type DailyKind = 'card' | 'grila' | 'eroare';

export interface DailyItem {
  /** Cheia din statistici: `${quizId}:${questionId}`. */
  statKey: string;
  kind: DailyKind;
  quizId: string;
  quizTitle: string;
  question: Question;
  /** Zile de întârziere față de termen (0 dacă nu era programată). */
  overdueDays: number;
  /** 0–100; 100 când nu există încă răspunsuri. */
  accuracy: number;
  priority: number;
  /** Timp estimat, în secunde. */
  seconds: number;
}

/** Plafonul zilnic al cozii; restul rămân scadente pentru ziua următoare. */
export const DAILY_QUEUE_CAP = 60;
/** Durata „Începe, 15 min”, în secunde. */
export const QUICK_SESSION_SECONDS = 15 * 60;
/** Timp mediu estimat pe element, în secunde. */
export const SECONDS_PER_ITEM: Readonly<Record<DailyKind, number>> = { card: 20, grila: 45, eroare: 60 };

const DAY_MS = 86_400_000;

export function dailyPriority(kind: DailyKind, overdueDays: number, accuracy: number): number {
  const lateness = Math.min(Math.max(overdueDays, 0), 30);
  const weakness = (100 - Math.min(Math.max(accuracy, 0), 100)) / 5; // 0–20
  return lateness + weakness + (kind === 'eroare' ? 3 : 0);
}

const accuracyOf = (stat: QuestionStat | undefined): number => {
  if (!stat) return 100;
  const total = stat.timesCorrect + stat.timesWrong;
  return total > 0 ? Math.round((stat.timesCorrect / total) * 100) : 100;
};

export interface DailyQueueOptions {
  quizzes: ReadonlyArray<Quiz>;
  stats: Readonly<Record<string, QuestionStat>>;
  now?: number;
  cap?: number;
  seconds?: Partial<Record<DailyKind, number>>;
}

export interface DailyQueue {
  /** Coada zilei, cea mai urgentă prima, tăiată la plafon. */
  items: DailyItem[];
  /** Câte elemente scadente există în total (înainte de plafon). */
  total: number;
  remaining: number;
  counts: Record<DailyKind, number>;
  seconds: number;
}

export function buildDailyQueue(options: DailyQueueOptions): DailyQueue {
  const { quizzes, stats, now = Date.now(), cap = DAILY_QUEUE_CAP } = options;
  const secs = { ...SECONDS_PER_ITEM, ...options.seconds };
  const quizList = quizzes as Quiz[];
  const statMap = stats as Record<string, QuestionStat>;
  const byKey = new Map<string, DailyItem>();
  const make = (kind: DailyKind, quizId: string, quizTitle: string, question: Question, overdueMs: number): DailyItem => {
    const statKey = `${quizId}:${question.id}`;
    const overdueDays = Math.floor(Math.max(0, overdueMs) / DAY_MS);
    const accuracy = accuracyOf(stats[statKey]);
    return { statKey, kind, quizId, quizTitle, question, overdueDays, accuracy, priority: dailyPriority(kind, overdueDays, accuracy), seconds: secs[kind] };
  };

  for (const card of buildDueQueue({ quizzes: quizList, stats, now, cap: Infinity }).items) {
    byKey.set(card.statKey, make('card', card.quiz.id, card.quiz.title, card.question, card.overdueMs));
  }
  for (const due of buildDueItems(statMap, quizList, now)) {
    const key = `${due.quizId}:${due.question.id}`;
    byKey.set(key, make('grila', due.quizId, due.quizTitle, due.question, now - (stats[key]?.nextReview ?? now)));
  }
  // Greșelile încă deschise intră și când nu sunt programate; cele programate în viitor își așteaptă termenul.
  for (const entry of buildErrorEntries(quizList, statMap)) {
    if (byKey.has(entry.key) || entry.stat.nextReview > now) continue;
    byKey.set(entry.key, make('eroare', entry.quiz.id, entry.quiz.title, entry.question, 0));
  }

  const sorted = [...byKey.values()].sort((a, b) => b.priority - a.priority || b.overdueDays - a.overdueDays);
  const items = sorted.slice(0, Math.max(0, cap));
  const counts: Record<DailyKind, number> = { card: 0, grila: 0, eroare: 0 };
  for (const item of items) counts[item.kind] += 1;
  return {
    items,
    total: sorted.length,
    remaining: sorted.length - items.length,
    counts,
    seconds: items.reduce((sum, item) => sum + item.seconds, 0),
  };
}

/** Începutul cozii (în ordinea priorității) care încape în `budgetSeconds`; măcar un element, dacă există. */
export function planTimeBox(items: ReadonlyArray<DailyItem>, budgetSeconds: number = QUICK_SESSION_SECONDS): { items: DailyItem[]; seconds: number } {
  const picked: DailyItem[] = [];
  let seconds = 0;
  for (const item of items) {
    if (picked.length > 0 && seconds + item.seconds > budgetSeconds) break;
    picked.push(item);
    seconds += item.seconds;
  }
  return { items: picked, seconds };
}

export const minutesOf = (seconds: number): number => Math.max(1, Math.round(seconds / 60));
