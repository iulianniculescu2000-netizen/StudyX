import { isFlashcardDeck } from './deckKind';
import { isDueStat } from '../store/statsStore';
import { isFolderSessionQuiz } from './rezidentiatOverview';
import { normalizeSearchText } from './searchText';
import type { Question, QuestionStat, Quiz } from '../types';

export interface DueItem {
  quizId: string;
  quizTitle: string;
  question: Question;
}

/**
 * Întrebările scadente la recapitulare, exact cele din coada zilnică (/daily-review).
 * Pachetele de flashcarduri au repetiția lor, iar statisticile unor seturi sau întrebări șterse nu
 * mai au ce arăta, deci sunt sărite. O singură sursă pentru pagină și pentru contoarele din aplicație.
 */
export function buildDueItems(
  stats: Record<string, QuestionStat>,
  quizzes: Quiz[],
  now: number = Date.now(),
): DueItem[] {
  const quizById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  const due = Object.values(stats)
    .filter((s) => isDueStat(s, now))
    .flatMap((s) => {
      const quiz = quizById.get(s.quizId);
      if (!quiz || isFlashcardDeck(quiz)) return [];
      const question = quiz.questions.find((q) => q.id === s.questionId);
      if (!question || question.hidden) return [];
      return [{ quizId: quiz.id, quizTitle: quiz.title, question }];
    });

  // Sesiunile combinate („mix-…”) refolosesc întrebările seturilor lor și au statistici proprii: aceeași
  // întrebare scadentă în ambele ar apărea de două ori. Cheia: id + text normalizat; setul real are întâietate.
  const seen = new Set<string>();
  const ordered = [
    ...due.filter((item) => !isFolderSessionQuiz(quizById.get(item.quizId)!)),
    ...due.filter((item) => isFolderSessionQuiz(quizById.get(item.quizId)!)),
  ];
  const unique = new Set<DueItem>();
  for (const item of ordered) {
    const key = `${item.question.id}|${normalizeSearchText(item.question.text).replace(/\s+/g, ' ').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.add(item);
  }
  return due.filter((item) => unique.has(item));
}

/** Câte întrebări intră într-o sesiune zilnică; restul rămân scadente pentru următoarea. */
export const DAILY_SESSION_CAP = 40;

/** Sesiunea de azi (primele `cap`) și câte rămân scadente după ea. Nimic nu se șterge: elementele rămân scadente. */
export function planDailySession<T>(due: ReadonlyArray<T>, cap: number = DAILY_SESSION_CAP): { today: T[]; remaining: number } {
  const today = due.slice(0, Math.max(0, cap));
  return { today, remaining: due.length - today.length };
}
