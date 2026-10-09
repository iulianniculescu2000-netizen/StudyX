import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuizStore } from '../../../store/quizStore';
import { useToastStore } from '../../../store/toastStore';
import { useUserStore } from '../../../store/userStore';
import { useFolderStore } from '../../../store/folderStore';
import { useFlashcardHubSession, type FlashcardResumeHandle } from '../../../store/flashcardHubSessionStore';
import type { Folder, Quiz } from '../../../types';
import type { GeneratedDeckInfo } from '../sections';

/** The "Pachet creat" card and resume handle, kept in the session store so they survive leaving the page. */
export function useGeneratedDeck(quizzes: Quiz[]) {
  const navigate = useNavigate();
  const updateQuiz = useQuizStore((s) => s.updateQuiz);
  const addToast = useToastStore((state) => state.addToast);
  const activeProfileId = useUserStore((state) => state.activeProfileId);
  const hubSession = useFlashcardHubSession();
  const createdDeck = hubSession.profileId === activeProfileId ? hubSession.createdDeck : null;
  const createdCardRef = useRef<HTMLDivElement>(null);

  const setCreatedDeck = (next: GeneratedDeckInfo | null | ((previous: GeneratedDeckInfo | null) => GeneratedDeckInfo | null)) => (
    useFlashcardHubSession.getState().setCreatedDeck(activeProfileId, next)
  );
  const setResume = (next: FlashcardResumeHandle | null) => useFlashcardHubSession.getState().setResume(activeProfileId, next);

  // A finished AI deck is announced, not silently opened: a toast says where it
  // landed and the card at the top of the page lets the user move it.
  const announceGeneratedDeck = (deck: {
    id: string;
    title: string;
    count: number;
    folder: Folder | null;
    suggested: boolean;
    /** The AI stopped early: the deck holds what was made and can be resumed. */
    interrupted?: { requested: number; reason: string; waitSeconds: number | null };
  }) => {
    setCreatedDeck({
      id: deck.id,
      title: deck.title,
      count: deck.count,
      folderId: deck.folder?.id ?? null,
      suggested: deck.suggested,
      interrupted: deck.interrupted ? { ...deck.interrupted, at: Date.now() } : undefined,
    });
    const where = deck.folder ? `„${deck.folder.name}"` : 'Neclasificate';
    if (deck.interrupted) {
      addToast(
        `Am creat ${deck.count} din ${deck.interrupted.requested} flashcarduri în ${where}. ${deck.interrupted.reason}`,
        'warning',
        9000,
      );
      return;
    }
    addToast(
      `Flashcardurile au fost generate în ${where}.`,
      'success',
      7000,
      { label: 'Începe', onClick: () => navigate(`/flashcards/session/${deck.id}?mode=all`) },
    );
  };

  const moveCreatedDeck = (folderId: string) => {
    if (!createdDeck) return;
    const folder = folderId === '__uncategorized__'
      ? null
      : useFolderStore.getState().folders.find((item) => item.id === folderId) ?? null;
    updateQuiz(createdDeck.id, {
      folderId: folder?.id ?? null,
      category: folder?.name ?? 'AI Flashcards',
      ...(folder ? { color: folder.color } : {}),
    });
    setCreatedDeck({ ...createdDeck, folderId: folder?.id ?? null, suggested: false });
  };

  const createdDeckId = createdDeck?.id;
  useEffect(() => {
    if (createdDeckId) createdCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [createdDeckId]);

  // The deck may have been deleted since — then there is nothing to confirm or move.
  const visibleCreatedDeck = createdDeck && quizzes.some((quiz) => quiz.id === createdDeck.id) ? createdDeck : null;

  return { activeProfileId, createdDeck, setCreatedDeck, setResume, announceGeneratedDeck, moveCreatedDeck, createdCardRef, visibleCreatedDeck };
}

export type GeneratedDeckApi = ReturnType<typeof useGeneratedDeck>;
