import { useQuizStore } from '../../../store/quizStore';
import { useToastStore } from '../../../store/toastStore';
import { useUserStore } from '../../../store/userStore';
import { friendlyAIError, rateLimitWaitSeconds } from '../../../lib/ai/friendlyError';
import { NoNewFlashcardsError } from '../../../lib/groq';
import { getFlashcardResume } from '../../../store/flashcardHubSessionStore';
import type { Quiz } from '../../../types';
import type { GeneratedDeckInfo } from '../sections';
import { buildFlashcardQuestion, attachRelevantPdfImages } from '../cardBuilders';
import type { AiRun } from './useAiRun';
import type { GeneratedDeckApi } from './useGeneratedDeck';

/** Picks an interrupted run up where it stopped and adds the new cards to the same deck. */
export function useResumeGeneration(ai: AiRun, generated: GeneratedDeckApi, quizzes: Quiz[]) {
  const updateQuiz = useQuizStore((s) => s.updateQuiz);
  const addToast = useToastStore((state) => state.addToast);
  const { activeProfileId, createdDeck, setCreatedDeck, setResume } = generated;

  const resumeGeneration = async () => {
    const resume = getFlashcardResume(activeProfileId);
    const current = createdDeck;
    const deck = resume ? quizzes.find((quiz) => quiz.id === resume.deckId) : undefined;
    if (!resume || !current?.interrupted || !deck || resume.deckId !== current.id || ai.resuming || ai.aiLoading || ai.libraryGenerating) return;

    const profileAtStart = useUserStore.getState().activeProfileId;
    ai.setResuming(true);
    ai.setAiError('');
    const already = deck.questions.length;
    // Functional updates: the user may move the deck while this runs.
    const patchInfo = (changes: Partial<GeneratedDeckInfo>) => setCreatedDeck((previous) => (
      previous && previous.id === current.id ? { ...previous, ...changes } : previous
    ));

    try {
      const outcome = await ai.generateCards(resume.text, resume.sourceName, resume.requested - already, {
        startChunk: resume.nextChunk,
        chunkBudget: resume.requested,
        already,
        requested: resume.requested,
        avoidFronts: [...ai.existingFlashcardFronts, ...deck.questions.map((question) => question.text)],
      });
      // Read the deck now: the user may have edited, or deleted, it while the AI worked.
      const liveDeck = useQuizStore.getState().quizzes.find((quiz) => quiz.id === deck.id);
      if (!liveDeck || useUserStore.getState().activeProfileId !== profileAtStart) {
        setResume(null);
        setCreatedDeck((previous) => (previous && previous.id === current.id ? null : previous));
        addToast('Pachetul nu mai este disponibil, deci cardurile noi nu au fost adăugate.', 'info', 6000);
        return;
      }
      const fresh = attachRelevantPdfImages(
        outcome.cards.map((entry) => buildFlashcardQuestion(entry.front, entry.back)),
        resume.pages,
      );
      updateQuiz(liveDeck.id, { questions: [...liveDeck.questions, ...fresh] });
      const total = liveDeck.questions.length + fresh.length;

      if (outcome.interruption) {
        setResume({ ...resume, nextChunk: outcome.interruption.nextChunk });
        patchInfo({
          count: total,
          interrupted: {
            requested: resume.requested,
            reason: outcome.interruption.reason,
            waitSeconds: outcome.interruption.waitSeconds,
            at: Date.now(),
          },
        });
        addToast(`${total} din ${resume.requested} flashcarduri. ${outcome.interruption.reason}`, 'warning', 9000);
      } else {
        setResume(null);
        patchInfo({ count: total, interrupted: undefined });
        addToast(`Gata: ${total} flashcarduri în pachet.`, 'success', 6000);
      }
    } catch (error: unknown) {
      if (error instanceof NoNewFlashcardsError) {
        setResume(null);
        patchInfo({ interrupted: undefined });
        addToast('Nu am mai găsit carduri noi în textul acestui curs.', 'info', 6000);
      } else {
        const message = friendlyAIError(error);
        ai.notifyGenerationFailed(message);
        patchInfo({
          interrupted: { ...current.interrupted, reason: message, waitSeconds: rateLimitWaitSeconds(error), at: Date.now() },
        });
      }
    } finally {
      ai.setResuming(false);
      ai.setAiProgress('');
    }
  };

  return { resumeGeneration };
}
