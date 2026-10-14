import type { Quiz } from '../types';
import { isFlashcardDeck } from './deckKind';
import { isRezidentiatQuiz } from './rezidentiatBank';
import { isTopicPracticeQuiz } from './topicMastery';

/**
 * Numerele de „Grile” din Panou. `own` urmează exact regula din „Toate grilele” (bara laterală și QuizList),
 * iar grilele din Rezidențiat se numără separat, ca să nu apară cifre care nu se regăsesc nicăieri.
 */
export function countDashboardQuizzes(quizzes: Quiz[]): { own: number; residency: number } {
  let own = 0;
  let residency = 0;
  for (const quiz of quizzes) {
    if (quiz.archived || isFlashcardDeck(quiz) || isTopicPracticeQuiz(quiz)) continue;
    if (isRezidentiatQuiz(quiz)) residency += 1;
    else own += 1;
  }
  return { own, residency };
}
