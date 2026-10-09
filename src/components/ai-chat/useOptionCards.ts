import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { OPTION_CARD_CANCELLED, optionCardDone, optionCardFailed, optionCardIntro } from '../../ai/studyRequestScripts';
import { useFolderStore } from '../../store/folderStore';
import { generateStudyMaterial } from '../../lib/ai/studyMaterial';
import { DEFAULT_COUNT, detectStudyRequest, type StudyRequest } from '../../lib/ai/optionRequest';
import type { SourceScope } from '../../lib/ai/sourceScope';
import { defaultDestinationChoice, defaultNewFolderParent, destinationOptions } from '../../lib/ai/studyDestinations';
import type { FolderChoice } from '../../lib/rezidentiatFlashcardFolders';
import type { ChatMessage, OptionCard } from './shared';
import type { ChatThread } from './useChatMessages';

interface UseOptionCardsOptions {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  messagesRef: RefObject<ChatMessage[]>;
  chatThread: ChatThread;
}

const norm = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Folderul pomenit în mesaj: unul existent cu același nume, sau unul nou sub părintele implicit al spațiului. */
function folderFromRequest(request: StudyRequest, space: SourceScope): FolderChoice {
  if (!request.folderName) return defaultDestinationChoice(request.kind === 'flashcards' ? 'flashcards' : 'quiz', space);
  const kind = request.kind === 'flashcards' ? 'flashcards' : 'quiz';
  const known = destinationOptions(kind, space, useFolderStore.getState().folders)
    .find((option) => norm(option.label.split(' / ').pop() ?? option.label) === norm(request.folderName ?? ''));
  return known
    ? { mode: 'existing', id: known.id }
    : { mode: 'new', name: request.folderName, parentId: defaultNewFolderParent(kind, space) };
}

/**
 * Cererile „fă-mi flashcarduri / grile” din chat: în loc să ghicească nivelul, numărul și folderul, asistentul pune o carte
 * de opțiuni în conversație. Dacă utilizatorul a spus deja tot, generează direct; altfel întreabă doar ce lipsește.
 * Generarea trece prin același motor ca restul comenzilor agentului, deci regulile de folder și de Rezidențiat sunt aceleași.
 */
export function useOptionCards({ setMessages, messagesRef, chatThread }: UseOptionCardsOptions) {
  const space: SourceScope = chatThread === 'rezidentiat' ? 'rezidentiat' : 'general';

  const patchCard = useCallback((cardId: string, patch: Partial<OptionCard>, content?: string) => {
    setMessages((prev) => prev.map((message) => (message.optionCard?.id === cardId
      ? { ...message, ...(content !== undefined ? { content } : {}), optionCard: { ...message.optionCard, ...patch } }
      : message)));
  }, [setMessages]);

  const runCard = useCallback(async (card: OptionCard) => {
    patchCard(card.id, { status: 'running' });
    try {
      const result = await generateStudyMaterial({
        kind: card.kind,
        space: card.space,
        topic: card.topic,
        count: card.count,
        difficulty: card.difficulty,
        questionType: card.questionType,
        folder: card.folder,
      });
      patchCard(
        card.id,
        { status: 'done', route: result.route },
        optionCardDone({ kind: card.kind, topic: card.topic.trim(), produced: result.produced, requested: result.requested, destination: result.destination, grounded: result.grounded }),
      );
    } catch (error) {
      patchCard(card.id, { status: 'error' }, optionCardFailed(error instanceof Error ? error.message : ''));
    }
  }, [patchCard]);

  /** Prinde cererea de generare din mesaj. Întoarce `true` când a preluat-o (a pus cartea sau a pornit generarea). */
  const tryHandleOptionRequest = useCallback((text: string): boolean => {
    const request = detectStudyRequest(text);
    if (!request) return false;

    const card: OptionCard = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 10),
      kind: request.kind,
      status: 'pending',
      space,
      topic: request.topic,
      count: request.count ?? DEFAULT_COUNT[request.kind],
      difficulty: request.difficulty ?? 'auto',
      questionType: request.questionType ?? 'single',
      folder: folderFromRequest(request, space),
    };
    const complete = request.missing.length === 0;
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: complete
          ? `Mă apuc: ${request.kind === 'flashcards' ? 'flashcarduri' : 'grile'} despre „${request.topic}”.`
          : optionCardIntro({ kind: request.kind, topic: request.topic, count: request.count, difficulty: request.difficulty, folderName: request.folderName }),
        optionCard: card,
      },
    ]);
    // A spus tot ce trebuia: nu-l mai întrebăm nimic.
    if (complete) void runCard(card);
    return true;
  }, [runCard, setMessages, space]);

  const editOptionCard = useCallback((index: number, patch: Partial<OptionCard>) => {
    setMessages((prev) => prev.map((message, i) => (i === index && message.optionCard
      ? { ...message, optionCard: { ...message.optionCard, ...patch } }
      : message)));
  }, [setMessages]);

  const submitOptionCard = useCallback((index: number) => {
    const card = messagesRef.current?.[index]?.optionCard;
    if (!card || (card.status !== 'pending' && card.status !== 'error')) return;
    void runCard(card);
  }, [messagesRef, runCard]);

  const cancelOptionCard = useCallback((index: number) => {
    const card = messagesRef.current?.[index]?.optionCard;
    if (!card) return;
    patchCard(card.id, { status: 'cancelled' }, OPTION_CARD_CANCELLED);
  }, [messagesRef, patchCard]);

  return { tryHandleOptionRequest, editOptionCard, submitOptionCard, cancelOptionCard };
}
