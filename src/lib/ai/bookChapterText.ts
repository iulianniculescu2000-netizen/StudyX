/**
 * Full chapter text for the "Cuprins" (table of contents) reading feature —
 * separate from the AI-generation path (chapterQuizGeneration.ts,
 * chapterFlashcardGeneration.ts), which stays scoped to the curated Tematica
 * heading list, but reuses the SAME already-indexed, already-verified chunk
 * data (not a new independent text-matching pass — see kumarTableOfContents.ts
 * for why a from-scratch matcher against Kumar's real 41-chapter titles isn't
 * reliable: this book's extracted text doesn't contain all 41 chapters'
 * bodies, and some titles that do exist differ from the running header used
 * inside the chapter).
 */
import { getVaultChunksBySource } from '../../ai/vectorStore';
import { WHOLE_DOCUMENT_HEADING } from './chapterQuizGeneration';

/**
 * Concatenates ALL chunks tagged with `heading` (not just a preview slice) —
 * the same filter chapterFlashcardGeneration.ts already uses for
 * chapter-scoped generation, just returning full text instead of feeding an
 * AI call.
 */
export async function getChapterFullText(sourceId: string, heading: string): Promise<string> {
  const chunks = await getVaultChunksBySource(sourceId);
  const chapterChunks = heading === WHOLE_DOCUMENT_HEADING
    ? chunks
    : chunks.filter((chunk) => (chunk.heading?.trim() || WHOLE_DOCUMENT_HEADING) === heading);
  return chapterChunks.map((chunk) => chunk.text.trim()).filter(Boolean).join('\n\n');
}
