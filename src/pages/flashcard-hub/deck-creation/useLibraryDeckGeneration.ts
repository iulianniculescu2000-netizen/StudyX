import { useMemo } from 'react';
import { useQuizStore } from '../../../store/quizStore';
import { useAIStore } from '../../../store/aiStore';
import { useToastStore } from '../../../store/toastStore';
import { useUserStore } from '../../../store/userStore';
import { friendlyAIError } from '../../../lib/ai/friendlyError';
import { filterSourcesByScope } from '../../../lib/ai/sourceScope';
import { generateId, buildFlashcardQuestion } from '../cardBuilders';
import type { AiRun } from './useAiRun';
import type { DeckTarget } from './useDeckTarget';
import type { GeneratedDeckApi } from './useGeneratedDeck';
import { PROFILE_CHANGED_TOAST } from './progress';

// Already-indexed library courses, ready to turn into text flashcards with one
// click — no need to re-import the PDF. This is the practical "flashcarduri
// inteligente pe subpuncte" flow that previously only lived in the AI chat.
export function useLibraryDeckGeneration(ai: AiRun, target: DeckTarget, generated: GeneratedDeckApi, rezScope: boolean) {
  const addQuiz = useQuizStore((s) => s.addQuiz);
  const addToast = useToastStore((state) => state.addToast);
  const knowledgeSources = useAIStore((s) => s.knowledgeSources);
  const aiLibraryFolders = useAIStore((s) => s.libraryFolders);
  const readyLibrarySources = useMemo(
    () => filterSourcesByScope(knowledgeSources.filter((source) => source.indexStatus === 'ready'), aiLibraryFolders, rezScope ? 'rezidentiat' : 'general'),
    [knowledgeSources, aiLibraryFolders, rezScope],
  );

  const generateDeckFromLibrary = async (sourceId: string) => {
    const source = readyLibrarySources.find((entry) => entry.id === sourceId);
    if (!source || ai.libraryGenerating || ai.aiLoading || ai.resuming) return;

    ai.setLibraryGenerating(true);
    ai.setAiError('');
    ai.setAiProgress(`Citesc „${source.name}" din bibliotecă...`);
    const profileAtStart = useUserStore.getState().activeProfileId;

    try {
      const { getVaultChunksBySource } = await import('../../../ai/vectorStore');
      const chunks = await getVaultChunksBySource(sourceId);
      let text = '';
      for (const chunk of chunks) {
        text += (text ? '\n\n' : '') + chunk.text;
        if (text.length > 24000) break;
      }
      if (text.trim().length < 80) {
        throw new Error('Cursul nu are destul text indexat pentru flashcarduri.');
      }

      ai.setAiProgress('AI generează cardurile pe subpuncte...');
      const outcome = await ai.generateCards(text, source.name, ai.aiCount);
      if (useUserStore.getState().activeProfileId !== profileAtStart) {
        addToast(PROFILE_CHANGED_TOAST, 'warning', 7000);
        return;
      }
      const questions = outcome.cards.map((entry) => buildFlashcardQuestion(entry.front, entry.back));
      if (questions.length === 0) {
        throw new Error('AI nu a putut genera flashcarduri din acest curs.');
      }

      const id = generateId();
      const folderTarget = target.resolveGeneratedFolder(source.name);
      const title = `Flashcarduri · ${source.name.replace(/\.[^.]+$/, '')}`;
      addQuiz({
        id,
        title,
        description: `${questions.length} flashcarduri AI pe subpunctele cursului „${source.name}".`,
        emoji: '🤖',
        color: folderTarget.folder?.color ?? 'purple',
        category: folderTarget.folder?.name ?? 'AI Flashcards',
        kind: 'flashcard',
        folderId: folderTarget.folder?.id ?? null,
        shuffleQuestions: true,
        shuffleAnswers: true,
        tags: ['ai', 'flashcard', 'biblioteca'],
        questions,
        createdAt: Date.now(),
      });

      generated.setResume(outcome.interruption
        ? { deckId: id, text, sourceName: source.name, requested: ai.aiCount, nextChunk: outcome.interruption.nextChunk, pages: [] }
        : null);
      generated.announceGeneratedDeck({
        id,
        title,
        count: questions.length,
        folder: folderTarget.folder,
        suggested: folderTarget.suggested,
        interrupted: outcome.interruption
          ? { requested: ai.aiCount, reason: outcome.interruption.reason, waitSeconds: outcome.interruption.waitSeconds }
          : undefined,
      });
    } catch (error: unknown) {
      const message = friendlyAIError(error);
      ai.setAiError(message);
      ai.notifyGenerationFailed(message);
    } finally {
      ai.setLibraryGenerating(false);
      ai.setAiProgress('');
    }
  };

  return { readyLibrarySources, generateDeckFromLibrary };
}
