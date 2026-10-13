import { isTopicPracticeQuiz } from '../lib/topicMastery';
import { useEffect, useMemo, useState } from 'react';
import { useFolderStore } from '../store/folderStore';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore, type ProfilePlan } from '../store/organizareStore';
import { buildDeckSummaries } from '../pages/flashcard-hub/deckSummaries';
import { buildResidencyContext, classifyResidencyDeck } from '../lib/flashcardGroups';
import { buildErrorEntries } from '../lib/errorNotebook';
import { isFolderSessionQuiz } from '../lib/rezidentiatOverview';
import { isRezidentiatQuiz } from '../lib/rezidentiatBank';
import { examDisciplines } from '../lib/examSimulation';
import type { Quiz, Folder, QuestionStat } from '../types';
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

/** Shared derivation keeps the live hook and the initial step filter in agreement. */
export function buildTourContext(
  ai: Pick<ReturnType<typeof useAIStore.getState>, 'providerKeys' | 'provider' | 'apiKey' | 'knowledgeSources'>,
  quizzes: Quiz[], folders: Folder[], stats: Record<string, QuestionStat>,
  plan: ProfilePlan | undefined, pathname: string, search = '', now = Date.now(),
): TourContext {
  const aiProviders = savedProviders(ai.providerKeys, ai.provider, ai.apiKey);
  const active = quizzes.filter((quiz) => !quiz.archived && !isFolderSessionQuiz(quiz) && !isTopicPracticeQuiz(quiz));
  const decks = buildDeckSummaries(active, stats, now);
  const residency = buildResidencyContext(folders);
  const residencyDecks = decks.filter((deck) => classifyResidencyDeck(deck.quiz, residency) !== null);
  const generalDecks = decks.filter((deck) => classifyResidencyDeck(deck.quiz, residency) === null);
  const quizSets = active.filter((quiz) => !isFlashcardDeck(quiz));
  const residencyQuizzes = quizSets.filter((quiz) => isRezidentiatQuiz(quiz) ||
    (!!quiz.folderId && residency.folderIds.has(quiz.folderId)));
  const readySourceCount = ai.knowledgeSources.filter((source) => !source.indexStatus || source.indexStatus === 'ready').length;
  return {
    aiProviders, aiKeyCount: aiProviders.length,
    aiReady: !!(ai.apiKey.trim() || ai.providerKeys[ai.provider]?.trim()),
    quizCount: quizSets.length, deckCount: decks.length, sourceCount: ai.knowledgeSources.length,
    readySourceCount,
    indexingSourceCount: ai.knowledgeSources.filter((source) => source.indexStatus === 'indexing').length,
    failedSourceCount: ai.knowledgeSources.filter((source) => source.indexStatus === 'error').length,
    dueQuizCount: quizSets.reduce((sum, quiz) => sum + quiz.questions.filter((q) => {
      const stat = stats[`${quiz.id}:${q.id}`];
      return !q.hidden && stat && !stat.retired && stat.nextReview > 0 && stat.nextReview <= now;
    }).length, 0),
    dueCardCount: decks.reduce((sum, deck) => sum + deck.due, 0),
    newCardCount: decks.reduce((sum, deck) => sum + deck.total - deck.seen, 0),
    errorCount: buildErrorEntries(quizzes, stats).length,
    hasPlan: !!plan?.summary,
    planDoneCount: plan?.summary?.done ?? 0, planTopicCount: plan?.summary?.total ?? 0,
    generalDeckCount: generalDecks.length,
    generalDueCardCount: generalDecks.reduce((sum, deck) => sum + deck.due, 0),
    generalNewCardCount: generalDecks.reduce((sum, deck) => sum + deck.total - deck.seen, 0),
    residencyQuizCount: residencyQuizzes.length, residencyDeckCount: residencyDecks.length,
    residencyDueCardCount: residencyDecks.reduce((sum, deck) => sum + deck.due, 0),
    residencyNewCardCount: residencyDecks.reduce((sum, deck) => sum + deck.total - deck.seen, 0),
    simulationQuestionCount: examDisciplines(quizzes).reduce((sum, discipline) => sum + discipline.count, 0),
    pathname, search,
  };
}

/** Subscribe to stored references, never freshly allocated selector results. */
export function useTourContext(): TourContext {
  const { pathname, search } = useLocation();
  const providerKeys = useAIStore((state) => state.providerKeys);
  const provider = useAIStore((state) => state.provider);
  const apiKey = useAIStore((state) => state.apiKey);
  const knowledgeSources = useAIStore((state) => state.knowledgeSources);
  const quizzes = useQuizStore((state) => state.quizzes);
  const folders = useFolderStore((state) => state.folders);
  const stats = useStatsStore((state) => state.questionStats);
  const profileId = useUserStore((state) => state.activeProfileId);
  const plan = useOrganizareStore((state) => profileId ? state.byProfile[profileId] : undefined);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => buildTourContext(
    { providerKeys, provider, apiKey, knowledgeSources }, quizzes, folders, stats, plan, pathname, search, now,
  ), [providerKeys, provider, apiKey, knowledgeSources, quizzes, folders, stats, plan, pathname, search, now]);
}

export function readTourContext(pathname: string, search = ''): TourContext {
  const profileId = useUserStore.getState().activeProfileId;
  return buildTourContext(useAIStore.getState(), useQuizStore.getState().quizzes,
    useFolderStore.getState().folders, useStatsStore.getState().questionStats,
    profileId ? useOrganizareStore.getState().byProfile[profileId] : undefined, pathname, search);
}
