import type { Quiz } from '../types';

/**
 * Single source of truth for "is this set a flashcard deck or a quiz?".
 *
 * History: detection used to be ad-hoc and inconsistent — QuizCard only checked
 * `tags.includes('flashcard')`, while the Flashcard hub used a broader heuristic.
 * That mismatch made AI/Anki decks open as quizzes from a folder even though they
 * were created as flashcards. Now creation stamps an explicit `quiz.kind`, and
 * this helper trusts it. Legacy sets without `kind` fall back to the heuristic.
 */
export function isFlashcardDeck(quiz: Pick<Quiz, 'kind' | 'tags' | 'questions'>): boolean {
  // 1. Explicit intent always wins.
  if (quiz.kind === 'flashcard') return true;
  if (quiz.kind === 'quiz') return false;

  // 2. Tag-based detection for legacy decks (created before `kind` existed).
  const tags = (quiz.tags ?? []).map((tag) => tag.toLowerCase());
  const FLASHCARD_TAGS = ['flashcard', 'deck', 'anki', 'atlas', 'foto'];
  if (tags.some((tag) => FLASHCARD_TAGS.includes(tag))) return true;
  // 'ai'/'pdf'/'image'/'visual' alone are ambiguous (AI Studio quizzes also use
  // 'ai'), so only treat them as flashcards when the questions look like cards.

  // 3. Shape-based fallback: a deck where most questions have a single correct
  //    "answer card" (one option, not multiple-choice) is a flashcard deck.
  const questions = quiz.questions ?? [];
  if (questions.length === 0) return false;
  const cardLike = questions.filter(
    (question) => question.options.length <= 1 && !question.multipleCorrect,
  ).length;
  return cardLike > questions.length * 0.7;
}


