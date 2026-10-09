/**
 * Spreads a Knowledge Vault folder's chapters into a calendar of study
 * sessions between today and an exam date — a first pass through every
 * chapter, followed by 0-3 "recapitulare" (review) passes weighted by the
 * target grade, landing chronologically closer to the exam. Mirrors the
 * date-math style of examSplit.ts (which does the same for already-generated
 * quiz questions), reusing `daysUntil` directly rather than duplicating it.
 */
import { daysUntil } from './examSplit';
import type { AIExamPlan, AILibraryFolder, AIStudyPlanChapterRef, AIStudyPlanSession, AIStudySessionKind } from '../store/aiStore';

export interface StudyPlanChapterInput {
  sourceId: string;
  sourceName: string;
  heading: string;
  label: string;
  chunkCount: number;
}

export interface StudyPlanSessionDraft {
  index: number;
  kind: AIStudySessionKind;
  passIndex: number;
  chapters: StudyPlanChapterInput[];
  date: Date;
}

export type StudyPlanWarning = 'no-chapters' | 'dense-schedule' | 'exam-imminent' | 'recap-passes-trimmed';

export interface StudyPlan {
  totalDays: number;
  recapPasses: number;
  sessions: StudyPlanSessionDraft[];
  warnings: StudyPlanWarning[];
}

/** Notă țintă → treceri de recapitulare: 1-4→0, 5-6→1, 7-8→2, 9-10→3. */
export function recapPassesForGrade(grade: number): number {
  const clamped = Math.max(1, Math.min(10, grade));
  return Math.max(0, Math.min(3, Math.round((clamped - 4) / 2)));
}

/** Slice `items` into `chunkCount` roughly-equal, contiguous pieces (same shape as examSplit.ts's splitQuestionsIntoChunks). */
function splitIntoChunks<T>(items: T[], chunkCount: number): T[][] {
  const count = Math.max(1, Math.min(chunkCount, items.length || 1));
  const base = Math.floor(items.length / count);
  const remainder = items.length % count;
  const chunks: T[][] = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const size = base + (i < remainder ? 1 : 0);
    chunks.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return chunks;
}

/**
 * Spreads `sessionCount` dates evenly across the day-offset window
 * [windowStart, windowEnd] (same spacing shape as examSplit.ts's
 * suggestSessionDates, parameterized on a window instead of [1, totalDays]),
 * clamped so nothing is ever scheduled after the exam.
 */
function phaseSessionDates(from: Date, windowStart: number, windowEnd: number, sessionCount: number, totalDays: number): Date[] {
  const span = Math.max(0, windowEnd - windowStart);
  const dates: Date[] = [];
  for (let i = 0; i < sessionCount; i += 1) {
    const raw = sessionCount === 1 ? windowEnd : windowStart + Math.round(((i + 1) * span) / (sessionCount + 1));
    const offset = Math.min(Math.max(1, raw), totalDays);
    const d = new Date(from);
    d.setDate(d.getDate() + offset);
    dates.push(d);
  }
  return dates;
}

export function buildStudyPlan(
  chapters: StudyPlanChapterInput[],
  examDate: Date,
  targetGrade: number,
  from: Date = new Date(),
): StudyPlan {
  const totalDays = daysUntil(examDate, from);

  if (chapters.length === 0) {
    return { totalDays, recapPasses: 0, sessions: [], warnings: ['no-chapters'] };
  }

  if (totalDays <= 1) {
    const dates = phaseSessionDates(from, 0, totalDays, 1, totalDays);
    return {
      totalDays,
      recapPasses: 0,
      sessions: [{ index: 0, kind: 'first-pass', passIndex: 0, chapters, date: dates[0] }],
      warnings: ['exam-imminent'],
    };
  }

  const warnings: StudyPlanWarning[] = [];
  const requestedRecapPasses = recapPassesForGrade(targetGrade);
  const recapPasses = Math.min(requestedRecapPasses, Math.max(0, totalDays - 1));
  if (recapPasses < requestedRecapPasses) warnings.push('recap-passes-trimmed');
  if (chapters.length > totalDays) warnings.push('dense-schedule');

  // First-pass phase gets weight 2, each recap phase weight 1 — recap phases
  // land chronologically after the first pass, i.e. naturally closer to the
  // exam, with no extra placement logic needed.
  const totalWeight = 2 + recapPasses;
  const firstPassDays = Math.max(1, Math.min(totalDays, Math.round((totalDays * 2) / totalWeight)));

  const sessions: StudyPlanSessionDraft[] = [];
  let index = 0;
  let windowStart = 0;

  const addPhase = (kind: AIStudySessionKind, passIndex: number, windowEnd: number) => {
    const availableDays = Math.max(1, windowEnd - windowStart);
    const sessionCount = Math.min(chapters.length, availableDays);
    const chunks = splitIntoChunks(chapters, sessionCount);
    const dates = phaseSessionDates(from, windowStart, windowEnd, chunks.length, totalDays);
    chunks.forEach((chapterChunk, i) => {
      sessions.push({ index: index++, kind, passIndex, chapters: chapterChunk, date: dates[i] });
    });
    windowStart = windowEnd;
  };

  addPhase('first-pass', 0, firstPassDays);

  const remainingDays = Math.max(0, totalDays - firstPassDays);
  if (recapPasses > 0) {
    const base = Math.floor(remainingDays / recapPasses);
    const remainder = remainingDays % recapPasses;
    for (let pass = 0; pass < recapPasses; pass += 1) {
      const phaseDays = Math.max(1, base + (pass < remainder ? 1 : 0));
      addPhase('recap', pass + 1, Math.min(totalDays, windowStart + phaseDays));
    }
  }

  return { totalDays, recapPasses, sessions, warnings };
}

/** Local calendar date as 'YYYY-MM-DD' — never toISOString() (shifts a day across timezones). Exported so callers can compare against AIExamPlan/AIStudyPlanSession dates without duplicating this. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toExamPlan(plan: StudyPlan, examDate: Date, targetGrade: number, generateId: () => string): AIExamPlan {
  const sourceIds = Array.from(new Set(plan.sessions.flatMap((s) => s.chapters.map((c) => c.sourceId))));
  return {
    examDate: localDateStr(examDate),
    targetGrade,
    generatedAt: Date.now(),
    sourceIds,
    sessions: plan.sessions.map((s) => ({
      id: generateId(),
      date: localDateStr(s.date),
      kind: s.kind,
      passIndex: s.passIndex,
      chapters: s.chapters.map((c) => ({ sourceId: c.sourceId, sourceName: c.sourceName, heading: c.heading, label: c.label })),
      done: false,
    })),
  };
}

function chapterSetKey(chapters: AIStudyPlanChapterRef[]): string {
  return chapters.map((c) => `${c.sourceId}::${c.heading}`).sort().join('|');
}

/** Carries over `done` flags from `oldPlan` onto matching sessions (same kind+pass+chapter set) in `newPlan`, so regenerating a plan never silently discards checked-off progress. */
export function mergeExamPlanProgress(newPlan: AIExamPlan, oldPlan: AIExamPlan | null | undefined): AIExamPlan {
  if (!oldPlan) return newPlan;
  const doneKeys = new Set(
    oldPlan.sessions
      .filter((s) => s.done)
      .map((s) => `${s.kind}::${s.passIndex}::${chapterSetKey(s.chapters)}`),
  );
  return {
    ...newPlan,
    sessions: newPlan.sessions.map((session) => (
      doneKeys.has(`${session.kind}::${session.passIndex}::${chapterSetKey(session.chapters)}`)
        ? { ...session, done: true }
        : session
    )),
  };
}

export interface DueExamSession {
  folderId: string;
  folderName: string;
  session: AIStudyPlanSession;
}

/**
 * The single most-relevant exam-plan session to surface outside the Knowledge
 * Vault (e.g. on the Dashboard) — the earliest undone session, today or
 * overdue, across every folder whose exam hasn't already passed. Skipping a
 * day never silently drops that day's session; it just becomes "today's".
 */
export function findDueExamSession(folders: AILibraryFolder[], todayStr: string): DueExamSession | null {
  let best: DueExamSession | null = null;
  for (const folder of folders) {
    const plan = folder.examPlan;
    if (!plan || plan.examDate < todayStr) continue;
    for (const session of plan.sessions) {
      if (session.done || session.date > todayStr) continue;
      if (!best || session.date < best.session.date) {
        best = { folderId: folder.id, folderName: folder.name, session };
      }
    }
  }
  return best;
}
