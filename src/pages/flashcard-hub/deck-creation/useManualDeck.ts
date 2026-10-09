import { useNavigate } from 'react-router-dom';
import { useQuizStore } from '../../../store/quizStore';
import { useStatsStore } from '../../../store/statsStore';
import { buildMistakeFlashcardQuiz } from '../../../lib/adaptiveStudy';
import type { Quiz } from '../../../types';
import { generateId, buildFlashcardQuestion } from '../cardBuilders';
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

  const createQuickDeck = () => {
    const deckId = generateId();
    const now = Date.now();
    const questions = [
      buildFlashcardQuestion(
        'Care este primul pas când înveți un concept nou?',
        'Formulează definiția în cuvintele tale și notează un exemplu concret.',
      ),
      buildFlashcardQuestion(
        'Cum verifici rapid dacă ai înțeles o lecție?',
        'Închide materialul și explică ideea principală în 30 de secunde, fără să copiezi textul.',
      ),
      buildFlashcardQuestion(
        'Ce faci cu o greșeală repetată?',
        'O transformi într-un card scurt: întrebare clară pe față, răspuns esențial pe spate.',
      ),
      buildFlashcardQuestion(
        'Când este cel mai util un mnemonic?',
        'Când trebuie să reții liste, pași, excepții sau asocieri care nu se leagă natural între ele.',
      ),
      buildFlashcardQuestion(
        'Ce înseamnă recapitulare activă?',
        'Încerci să recuperezi răspunsul din memorie înainte să verifici materialul.',
      ),
      buildFlashcardQuestion(
        'Cum alegi cardurile pentru azi?',
        'Începi cu restanțele, apoi treci la cardurile noi sau la punctele slabe.',
      ),
    ];

    addQuiz({
      id: deckId,
      title: `Deck rapid · ${new Date(now).toLocaleDateString('ro-RO')}`,
      description: 'Deck scurt pentru testarea fluxului de flashcarduri și pentru încălzire.',
      emoji: '🃏',
      color: selectedFolder?.color ?? 'green',
      category: selectedFolder?.name ?? 'Flashcards',
      folderId: selectedFolder?.id ?? null,
      kind: 'flashcard',
      shuffleQuestions: false,
      shuffleAnswers: false,
      tags: ['flashcard', 'deck', 'manual', 'quick'],
      questions,
      createdAt: now,
    });

    navigate(`/flashcards/session/${deckId}?mode=all`);
  };

  return { createMistakeDeck, createQuickDeck };
}
