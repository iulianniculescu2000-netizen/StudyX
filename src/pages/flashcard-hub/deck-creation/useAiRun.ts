import { useMemo, useState } from 'react';
import { useToastStore } from '../../../store/toastStore';
import { friendlyAIError } from '../../../lib/ai/friendlyError';
import { FlashcardGenerationInterrupted, notesToFlashcards } from '../../../lib/groq';
import type { Quiz } from '../../../types';
import { generationFailedToastText, generationProgressText, rateLimitProgressText } from './progress';

export interface GenerateResume {
  startChunk: number;
  chunkBudget: number;
  already: number;
  requested: number;
  avoidFronts: string[];
}

/**
 * Shared state of the AI flows (PDF, library, resume): the busy flags, the progress text and the
 * single call into the generator. Kept in one place so "one generation at a time" holds across flows.
 */
export function useAiRun(quizzes: Quiz[]) {
  const addToast = useToastStore((state) => state.addToast);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiProgress, setAiProgress] = useState('');
  const [libraryGenerating, setLibraryGenerating] = useState(false);
  const [resuming, setResuming] = useState(false);

  const existingFlashcardFronts = useMemo(() => (
    quizzes
      .filter((quiz) => (quiz.tags ?? []).some((tag) => /flashcard|deck|ai|pdf/i.test(tag)))
      .flatMap((quiz) => quiz.questions.map((question) => question.text))
  ), [quizzes]);

  // Runs the AI for one deck. If it fails after some cards exist, those come back
  // with the reason instead of being lost, so the deck can be created and resumed.
  const generateCards = async (
    text: string,
    sourceName: string,
    count: number,
    resume?: GenerateResume,
  ): Promise<{
    cards: { front: string; back: string }[];
    interruption: { reason: string; waitSeconds: number | null; nextChunk: number } | null;
  }> => {
    try {
      const cards = await notesToFlashcards(text, {
        count,
        avoidFronts: resume?.avoidFronts ?? existingFlashcardFronts,
        sourceName,
        keepPartialOnError: true,
        startChunk: resume?.startChunk,
        chunkBudget: resume?.chunkBudget,
        onProgress: (done, target) => setAiProgress(generationProgressText(done, target, resume)),
        onWait: (seconds) => setAiProgress(rateLimitProgressText(seconds)),
      });
      return { cards, interruption: null };
    } catch (error: unknown) {
      if (error instanceof FlashcardGenerationInterrupted) {
        return {
          cards: error.partial,
          interruption: { reason: friendlyAIError(error.original), waitSeconds: error.waitSeconds, nextChunk: error.nextChunk },
        };
      }
      throw error;
    }
  };

  // One generation at a time: a second flow would overwrite the card and resume handle of the first.
  const guardBusy = (): boolean => {
    if (!(aiLoading || resuming || libraryGenerating)) return false;
    addToast('Așteaptă să se termine generarea curentă.', 'info', 4000);
    return true;
  };

  const notifyGenerationFailed = (message: string) => {
    addToast(generationFailedToastText(message), 'error', 8000);
  };

  return {
    aiLoading, setAiLoading, aiError, setAiError, aiCount, setAiCount, aiProgress, setAiProgress,
    libraryGenerating, setLibraryGenerating, resuming, setResuming,
    existingFlashcardFronts, generateCards, guardBusy, notifyGenerationFailed,
  };
}

export type AiRun = ReturnType<typeof useAiRun>;
