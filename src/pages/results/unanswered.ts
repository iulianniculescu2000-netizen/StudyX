import type { Question } from '../../types';
import { disciplineBreakdown, type DisciplineResult } from '../../lib/examSimulation';

/** Fără răspuns: întrebarea nu a fost văzută (examen expirat) sau a fost lăsată goală (timer). Nu e „greșită". */
export function isUnanswered(answers: Record<string, string[]> | undefined, question: Pick<Question, 'id'>): boolean {
  return (answers?.[question.id] ?? []).length === 0;
}

export function countUnanswered(answers: Record<string, string[]> | undefined, questions: Pick<Question, 'id'>[]): number {
  return questions.filter((question) => isUnanswered(answers, question)).length;
}

export type DisciplineRow = DisciplineResult & { unanswered: number };

/** Rezultatul pe discipline: scorul rămâne din toate întrebările, iar cele fără răspuns se arată separat, nu ca greșite. */
export function disciplineBreakdownWithUnanswered(
  questions: Question[],
  answers: Record<string, string[]> | undefined,
  isCorrect: (question: Question) => boolean,
): DisciplineRow[] {
  const skipped = disciplineBreakdown(questions.filter((question) => isUnanswered(answers, question)), () => false);
  const skippedBy = new Map(skipped.map((row) => [row.discipline, row.total]));
  return disciplineBreakdown(questions, isCorrect).map((row) => ({ ...row, unanswered: skippedBy.get(row.discipline) ?? 0 }));
}
