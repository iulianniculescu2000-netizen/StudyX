import { findOrCreateAiFlashcardsFolder } from './rezidentiatRoot';
import { mergeBuiltInDeck } from './rezidentiatFlashcards';
import { applyChapterSplit, isSplitDone, planChapterSplit } from './chapterDecks';

export interface KumarDeckStart {
  /** Un pachet de deschis direct (pachetul unic, sau primul capitol când cardurile sunt pe capitole). */
  deckId: string;
  /** Unde duce „Deschide”: sesiunea pachetului unic, sau lista pe capitole a cărții. */
  path: string;
  byChapter: boolean;
}

/**
 * Loads the bundled Kumar flashcard deck into the quiz store (or refreshes it
 * if it's already there) and tells where to open it.
 *
 * - New users (and anyone who already split the deck by chapter) get the cards straight into chapter
 *   decks (`Rezidențiat / Flashcarduri / Kumar`), refreshed from the bundle without losing history.
 * - Someone who still has the single deck keeps it untouched except for the usual content refresh:
 *   splitting it is only ever done on request (button in Flashcarduri).
 *
 * The shipped deck can be corrected between versions, so an existing deck gets
 * its content refreshed — but a card the user already has study history on
 * never disappears (see `mergeBuiltInDeck`).
 */
export async function startKumarDeckRoute(): Promise<KumarDeckStart | null> {
  const { useRezidentiatStore } = await import('../store/rezidentiatStore');
  const quizData = await useRezidentiatStore.getState().loadKumarFlashcards();
  if (!quizData) return null;

  const { useQuizStore } = await import('../store/quizStore');
  const quizStore = useQuizStore.getState();
  const existing = quizStore.quizzes.find((q) => q.id === quizData.id);
  const split = isSplitDone(quizStore.quizzes, quizData.id);

  if (existing && !split) {
    const { useStatsStore } = await import('../store/statsStore');
    const stats = useStatsStore.getState().questionStats;
    quizStore.updateQuiz(quizData.id, {
      questions: mergeBuiltInDeck(existing.questions, quizData.questions, (questionId) => `${quizData.id}:${questionId}` in stats),
      title: quizData.title,
    });
    return { deckId: quizData.id, path: `/flashcards/session/${quizData.id}`, byChapter: false };
  }

  const plan = planChapterSplit(quizData);
  if (!plan.splittable) {
    // Fără categorii recunoscute (nu se întâmplă cu pachetul livrat): rămâne pachetul unic.
    quizStore.addQuiz({ ...quizData, folderId: findOrCreateAiFlashcardsFolder() });
    return { deckId: quizData.id, path: `/flashcards/session/${quizData.id}`, byChapter: false };
  }

  const result = applyChapterSplit(quizData, { plan });
  return { deckId: result.deckIds[0], path: '/rezidentiat/flashcarduri?book=K', byChapter: true };
}

/** Compatibil cu apelanții vechi: id-ul unui pachet de deschis, sau null dacă nu s-a putut încărca. */
export async function startKumarDeck(): Promise<string | null> {
  return (await startKumarDeckRoute())?.deckId ?? null;
}
