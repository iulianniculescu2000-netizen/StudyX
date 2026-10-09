import { isFlashcardDeck } from './deckKind';
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
    .filter((s) => s.nextReview > 0 && s.nextReview <= now)
    .flatMap((s) => {
      const quiz = quizById.get(s.quizId);
      if (!quiz || isFlashcardDeck(quiz)) return [];
      const question = quiz.questions.find((q) => q.id === s.questionId);
      if (!question) return [];
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
