import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AIKnowledgeSource } from '../../store/aiStore';
import { useUIStore } from '../../store/uiStore';
import { useQuizStore } from '../../store/quizStore';
import { useFolderStore } from '../../store/folderStore';
import { useToastStore } from '../../store/toastStore';
import { dispatchDiscussChapter, dispatchGenerateFromChapter } from '../../lib/ai/chapterEvents';
import { generateFlashcardsFromChapter } from '../../lib/ai/chapterFlashcardGeneration';
import { findOrCreateAiFlashcardsFolder } from '../../lib/rezidentiatRoot';

/**
 * Acțiunile AI pe un capitol indexat al unei cărți (discută, grile, flashcarduri), comune pentru
 * lista de capitole din plan și pentru cărțile fără plan. `tags` se adaugă pachetului de carduri
 * (ex. `chapter:12`), ca să fie numărat la capitolul din plan.
 */
export function useChapterActions(source: AIKnowledgeSource | null) {
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const folders = useFolderStore((state) => state.folders);
  const addQuiz = useQuizStore((state) => state.addQuiz);
  const addToast = useToastStore((state) => state.addToast);
  const navigate = useNavigate();
  const [generatingHeading, setGeneratingHeading] = useState<string | null>(null);

  const discuss = (heading: string, label: string) => {
    if (!source) return;
    setChatOpen(true);
    dispatchDiscussChapter(source, heading, label, true);
  };

  const generateQuiz = (heading: string, label: string) => {
    if (!source) return;
    setChatOpen(true);
    dispatchGenerateFromChapter(source, heading, label, true);
  };

  const generateCards = async (heading: string, label: string, tags: string[] = []) => {
    if (!source || generatingHeading) return;
    setGeneratingHeading(heading);
    try {
      const folderId = findOrCreateAiFlashcardsFolder();
      const folder = folders.find((f) => f.id === folderId) ?? null;
      const { deck, cardCount } = await generateFlashcardsFromChapter({
        sourceId: source.id,
        sourceName: source.name,
        heading,
        label,
        folder,
        cardCount: 20,
        examStyle: 'residency',
      });
      addQuiz({ ...deck, folderId, tags: [...new Set([...(deck.tags ?? []), ...tags])] });
      addToast(`${cardCount} flashcarduri create din „${label}".`, 'success', 5000);
      navigate(`/flashcards/session/${deck.id}?mode=all`);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Generarea flashcardurilor a eșuat.', 'error', 5000);
    } finally {
      setGeneratingHeading(null);
    }
  };

  return { discuss, generateQuiz, generateCards, generatingHeading };
}
