/**
 * Split a folder's questions into evenly-sized study sessions spread across the
 * days remaining until an exam — "300 de grile" become "4 seturi a ~75, unul
 * din 3 în 3 zile" instead of one intimidating wall of questions.
 */
import type { Question, Quiz } from '../types';

const MS_PER_DAY = 86_400_000;
const MIN_CHUNKS = 2; // splitting only makes sense for 2+
const MAX_CHUNKS = 6; // avoid fragmenting into a dozen tiny sets

export function daysUntil(examDate: Date, from: Date = new Date()): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
}

/**
 * Smart default chunk count: driven by STUDY CADENCE (~one session per week),
 * not by question volume — a 300-question bank and a 60-question bank with the
 * same exam runway both want "a few" sessions, just sized differently, not a
 * pile of tiny daily fragments. Question count only trims the upper end (no
 * point proposing more sessions than ~1 per 5 questions) and forces a single
 * chunk when there's barely anything to split.
 */
export function suggestChunkCount(totalQuestions: number, daysRemaining: number): number {
  if (totalQuestions <= 1) return 1;
  const byCadence = Math.round(daysRemaining / 7) || 1;
  const byVolume = Math.max(1, Math.floor(totalQuestions / 5));
  const chunks = Math.min(byCadence, daysRemaining, MAX_CHUNKS, byVolume);
  return Math.max(MIN_CHUNKS, chunks);
}

/** Spread `chunkCount` session dates as evenly as possible between today and the exam (exclusive of exam day itself). */
export function suggestSessionDates(examDate: Date, chunkCount: number, from: Date = new Date()): Date[] {
  const totalDays = daysUntil(examDate, from);
  const dates: Date[] = [];
  for (let i = 0; i < chunkCount; i += 1) {
    // Evenly spaced across [1, totalDays], landing on or before exam day.
    const offset = Math.max(1, Math.round(((i + 1) * totalDays) / (chunkCount + 1)));
    const d = new Date(from);
    d.setDate(d.getDate() + Math.min(offset, totalDays));
    dates.push(d);
  }
  return dates;
}

/**
 * Slice a question list into `chunkCount` roughly-equal, contiguous pieces
 * (session 1 covers the first topics, session 2 the next, etc.) — preserves
 * original order so a folder that follows a course's structure stays coherent
 * per session, instead of scattering related questions across every chunk.
 */
export function splitQuestionsIntoChunks(questions: Question[], chunkCount: number): Question[][] {
  const count = Math.max(1, Math.min(chunkCount, questions.length || 1));
  const base = Math.floor(questions.length / count);
  const remainder = questions.length % count;
  const chunks: Question[][] = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    // Distribute the remainder across the first chunks so sizes differ by at most 1.
    const size = base + (i < remainder ? 1 : 0);
    chunks.push(questions.slice(cursor, cursor + size));
    cursor += size;
  }
  return chunks;
}

export interface ExamSplitPlan {
  chunkCount: number;
  totalQuestions: number;
  sessions: Array<{ index: number; questions: Question[]; date: Date }>;
}

/** Build the full plan (sizes + dates) without creating any quizzes yet — used for the preview. */
export function buildExamSplitPlan(quizzes: Quiz[], examDate: Date, chunkCount: number, from: Date = new Date()): ExamSplitPlan {
  const allQuestions = quizzes.flatMap((q) => q.questions);
  const chunks = splitQuestionsIntoChunks(allQuestions, chunkCount);
  const dates = suggestSessionDates(examDate, chunks.length, from);
  return {
    chunkCount: chunks.length,
    totalQuestions: allQuestions.length,
    sessions: chunks.map((questions, index) => ({ index, questions, date: dates[index] })),
  };
}

const DATE_FMT = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

/** Turn a plan into ready-to-save Quiz objects, named "<folder> — Sesiunea i/N (dd mmm)". */
export function planToQuizzes(
  plan: ExamSplitPlan,
  baseTitle: string,
  meta: Pick<Quiz, 'folderId' | 'color' | 'category'>,
  generateId: () => string,
): Quiz[] {
  return plan.sessions.map(({ index, questions, date }) => ({
    id: generateId(),
    title: `${baseTitle} — Sesiunea ${index + 1}/${plan.chunkCount} (${DATE_FMT.format(date)})`,
    description: `${questions.length} grile · plan automat pentru examen, spre ${DATE_FMT.format(date)}.`,
    emoji: '📅',
    category: meta.category,
    color: meta.color,
    kind: 'quiz',
    folderId: meta.folderId,
    shuffleQuestions: false,
    shuffleAnswers: true,
    tags: ['plan-examen'],
    questions,
    createdAt: Date.now(),
  }));
}
