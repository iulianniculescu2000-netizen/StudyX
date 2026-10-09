import { useQuizStore } from '../store/quizStore';
import type { Folder, Quiz } from '../types';
import { REZIDENTIAT_TAG } from './rezidentiatBank';
import { isFolderSessionQuiz, quizMixId } from './rezidentiatOverview';
import { isFlashcardDeck } from './deckKind';
import { playableQuestions } from './bankDedup';

/**
 * Builds one combined session out of several quizzes (e.g. every test of a
 * specialty) and returns its id, ready to play.
 *
 * The session keeps a stable id per folder and is refreshed in place on a repeat
 * run, so the answers given in it stay attributable (the Rezidențiat overview
 * counts them toward the specialty's progress) instead of being orphaned each
 * time a new copy replaced the old one.
 */
export function startQuizMix(
  folder: Pick<Folder, 'id' | 'name' | 'emoji' | 'color'>,
  sets: Quiz[],
  options: { title?: string; residency?: boolean } = {},
): string | null {
  const questions = sets.filter((quiz) => !isFolderSessionQuiz(quiz) && !isFlashcardDeck(quiz)).flatMap((quiz) => playableQuestions(quiz));
  if (questions.length === 0) return null;

  const { quizzes, addQuiz, updateQuiz, deleteQuiz } = useQuizStore.getState();
  const id = quizMixId(folder.id);
  const sessionTag = `folder-session:${folder.id}`;
  const now = Date.now();

  // Earlier versions gave every run a random id; drop those so only one session per folder remains.
  for (const stale of quizzes.filter((quiz) => quiz.id !== id && quiz.tags?.includes(sessionTag))) {
    deleteQuiz(stale.id, { keepImages: true });
  }

  const fields = {
    title: options.title ?? `${folder.name} — sesiune completă`,
    description: `Combină ${sets.length} seturi, ${questions.length} întrebări.`,
    questions,
    updatedAt: now,
    // Same marking as the source tests: an exam-style bank keeps its −0.25/wrong-option scoring.
    penaltyMode: sets.length > 0 && sets.every((quiz) => quiz.penaltyMode),
  };

  if (quizzes.some((quiz) => quiz.id === id)) {
    updateQuiz(id, fields);
  } else {
    addQuiz({
      id,
      emoji: folder.emoji,
      category: folder.name,
      kind: 'quiz',
      folderId: folder.id,
      color: folder.color,
      createdAt: now,
      shuffleQuestions: true,
      shuffleAnswers: false,
      // Rezidențiat sessions stay out of "Toate grilele", like the tests they combine.
      tags: options.residency ? [sessionTag, REZIDENTIAT_TAG] : [sessionTag],
      ...fields,
    });
  }
  return id;
}
