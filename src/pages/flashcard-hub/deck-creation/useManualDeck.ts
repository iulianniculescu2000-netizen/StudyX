import { useNavigate } from 'react-router-dom';
import { useQuizStore } from '../../../store/quizStore';
import { useStatsStore } from '../../../store/statsStore';
import { buildMistakeFlashcardQuiz } from '../../../lib/adaptiveStudy';
import type { Quiz } from '../../../types';
import type { AiRun } from './useAiRun';
import type { DeckTarget } from './useDeckTarget';
import type { GeneratedDeckApi } from './useGeneratedDeck';

/** Decks made without the AI: from the mistake bank and the small warm-up deck. */
export function useManualDeck(ai: AiRun, target: DeckTarget, generated: GeneratedDeckApi, quizzes: Quiz[]) {
  const navigate = useNavigate();
  const addQuiz = useQuizStore((s) => s.addQuiz);
  const questionStats = useStatsStore((s) => s.questionStats);
  const { selectedFolder } = target;
  const { activeProfileId } = generated;

  const createMistakeDeck = () => {
    if (!activeProfileId) {
      ai.setAiError('Nu există profil activ pentru a citi banca de greșeli.');
      return;
    }

    const quiz = buildMistakeFlashcardQuiz(activeProfileId, quizzes, questionStats);
    if (!quiz) {
      ai.setAiError('Nu am găsit suficiente greșeli utile pentru a crea flashcarduri.');
      return;
    }

    const targetQuiz = selectedFolder
      ? {
          ...quiz,
          folderId: selectedFolder.id,
          category: selectedFolder.name,
          color: selectedFolder.color,
          emoji: selectedFolder.emoji,
        }
      : quiz;
    addQuiz(targetQuiz);
    navigate(`/flashcards/session/${targetQuiz.id}?mode=all`);
  };

  return { createMistakeDeck };
}
