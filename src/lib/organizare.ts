import { BOOK_SHORT, curriculumChapters } from './curriculum';
import type { PlanSummary } from './organizare/types';

const DAY = 86_400_000;

/** Whole days from `today` to the exam; never negative. Both are YYYY-MM-DD. */
export function daysUntil(exam: string, today: Date): number {
  const target = new Date(`${exam}T12:00:00`).getTime();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return Math.max(0, Math.round((target - now) / DAY));
}

/**
 * One sentence about the study plan for the AI assistant, so "ce am de făcut azi?" has an answer
 * without the student pasting anything. Empty when there is no plan yet.
 */
export function describeStudyPlan(summary: PlanSummary | null | undefined, today: Date): string {
  if (!summary) return '';
  const days = daysUntil(summary.exam, today);
  const pass = summary.phase >= 1 && summary.phase <= 4
    ? `Planul de rezidențiat: trecerea ${summary.phase} din 4, ${summary.done} din ${summary.total} topicuri gata (${summary.pct}% din pagini).`
    : 'Planul de rezidențiat: etapa de simulări și menținere.';
  const now = summary.today ? ` Topicul curent: ${summary.today.n} (${summary.today.src}).` : '';
  const chapter = describeCurrentChapter(summary);
  const streak = summary.streak > 0 ? ` Serie de studiu: ${summary.streak} zile.` : '';
  return `${pass}${now}${chapter} Examenul este peste ${days} zile.${streak}`;
}

/** The curriculum chapter of the current topic and how much of it is done, or '' when the summary predates chapters. */
function describeCurrentChapter(summary: PlanSummary): string {
  if (!summary.chapter) return '';
  const chapter = curriculumChapters()[summary.chapter.index];
  if (!chapter) return '';
  const { done, total } = summary.chapter;
  return ` Capitolul curent: ${chapter.label} (${BOOK_SHORT[chapter.book]}, ${chapter.pages} p.), ${done} din ${total} topicuri gata.`;
}
