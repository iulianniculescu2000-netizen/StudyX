import { useLocation } from 'react-router-dom';
import { useAIStore } from '../store/aiStore';
import { useQuizStore } from '../store/quizStore';
import { isFlashcardDeck } from '../lib/deckKind';
import type { TourContext } from './types';

/** Distinct providers with a non-empty saved key, the active provider's key included. */
export function savedProviders(providerKeys: Partial<Record<string, string>>, provider: string, apiKey: string): string[] {
  const found = new Set<string>();
  for (const [id, key] of Object.entries(providerKeys)) if ((key ?? '').trim()) found.add(id);
  if (apiKey.trim()) found.add(provider);
  return [...found];
}

/** The live context for the step being shown. Re-renders the tour when any of it changes. */
export function useTourContext(): TourContext {
  const { pathname } = useLocation();
  const providerKeys = useAIStore((state) => state.providerKeys);
  const provider = useAIStore((state) => state.provider);
  const apiKey = useAIStore((state) => state.apiKey);
  const sourceCount = useAIStore((state) => state.knowledgeSources.length);
  const quizzes = useQuizStore((state) => state.quizzes);

  const aiProviders = savedProviders(providerKeys, provider, apiKey);
  let quizCount = 0;
  let deckCount = 0;
  for (const quiz of quizzes) {
    if (isFlashcardDeck(quiz)) deckCount += 1;
    else quizCount += 1;
  }
  return { aiProviders, aiKeyCount: aiProviders.length, quizCount, deckCount, sourceCount, pathname };
}

/** The same context read outside React, for deciding which steps apply when a tour starts. */
export function readTourContext(pathname: string): TourContext {
  const ai = useAIStore.getState();
  const quizzes = useQuizStore.getState().quizzes;
  const aiProviders = savedProviders(ai.providerKeys, ai.provider, ai.apiKey);
  const deckCount = quizzes.filter((quiz) => isFlashcardDeck(quiz)).length;
  return {
    aiProviders,
    aiKeyCount: aiProviders.length,
    quizCount: quizzes.length - deckCount,
    deckCount,
    sourceCount: ai.knowledgeSources.length,
    pathname,
  };
}
