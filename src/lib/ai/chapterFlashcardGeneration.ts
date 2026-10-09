import { getVaultChunksBySource } from '../../ai/vectorStore';
import { notesToFlashcards } from '../groq';
import { WHOLE_DOCUMENT_HEADING } from './chapterQuizGeneration';
import type { Folder, Quiz, Question } from '../../types';

interface ChapterFlashcardOptions {
  sourceId: string;
  sourceName: string;
  heading: string;
  label: string;
  folder: Folder | null;
  cardCount: number;
  /** Tags the deck as Rezidențiat content so it's excluded from "Toate grilele", same as chapterQuizGeneration's examStyle. */
  examStyle?: 'residency';
}

function buildFlashcardQuestion(front: string, back: string): Question {
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    text: front.trim(),
    multipleCorrect: false,
    difficulty: 'medium',
    explanation: '',
    options: [{ id: 'a', text: back.trim(), isCorrect: true }],
  };
}

/**
 * Generates a flashcard deck grounded only in one chapter's chunks — the
 * flashcard equivalent of `generateQuizFromChapter`. The existing chat-command
 * flashcard flow (`useStudioGeneration.ts`) samples a whole source's first
 * ~24000 chars and never tags results as rezidențiat; this is chapter-scoped
 * and tags for isolation, matching the per-chapter quiz-generation button.
 */
export async function generateFlashcardsFromChapter({
  sourceId,
  sourceName,
  heading,
  label,
  folder,
  cardCount,
  examStyle,
}: ChapterFlashcardOptions): Promise<{ deck: Quiz; cardCount: number }> {
  const chunks = await getVaultChunksBySource(sourceId);
  const chapterChunks = heading === WHOLE_DOCUMENT_HEADING
    ? chunks
    : chunks.filter((chunk) => (chunk.heading?.trim() || WHOLE_DOCUMENT_HEADING) === heading);

  if (chapterChunks.length === 0) {
    throw new Error(`Nu am găsit text indexat pentru capitolul "${label}".`);
  }

  const text = chapterChunks.map((chunk) => chunk.text).join('\n\n');
  const cards = await notesToFlashcards(text, { count: cardCount, sourceName: label });
  if (cards.length === 0) {
    throw new Error(`Nu am putut genera flashcarduri din capitolul "${label}".`);
  }

  const now = Date.now();
  const deck: Quiz = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    title: `Flashcarduri · ${label}`,
    description: `${cards.length} flashcarduri generate din capitolul „${label}" al documentului „${sourceName}".`,
    emoji: '🃏',
    color: folder?.color ?? 'purple',
    category: folder?.name ?? label,
    kind: 'flashcard',
    folderId: folder?.id ?? null,
    shuffleQuestions: true,
    shuffleAnswers: false,
    tags: [
      'ai-studio', 'chapter-pack', 'flashcard', sourceName,
      ...(heading !== WHOLE_DOCUMENT_HEADING ? [heading] : []),
      ...(examStyle === 'residency' ? ['rezidentiat'] : []),
    ],
    questions: cards.map((card) => buildFlashcardQuestion(card.front, card.back)),
    createdAt: now,
    updatedAt: now,
  };

  return { deck, cardCount: cards.length };
}
