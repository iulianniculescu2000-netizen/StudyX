import type { ChunkRecord } from '../../ai/types';
import { WHOLE_DOCUMENT_HEADING } from './chapterQuizGeneration';

export interface SourceChapter {
  heading: string;
  /** Human-readable label — the heading text, or a fallback for undetected structure. */
  label: string;
  chunkCount: number;
}

/**
 * Groups a Knowledge Vault source's chunks by detected heading, in the order headings first
 * appear in the document. Sources with no detected structure (common for scanned/poorly
 * formatted PDFs) come back as a single "Document complet" bucket — chapter-scoped generation
 * always has something to work with, it just isn't granular.
 */
export function groupChunksIntoChapters(chunks: ChunkRecord[]): SourceChapter[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const chunk of chunks) {
    const key = chunk.heading?.trim() || WHOLE_DOCUMENT_HEADING;
    if (!counts.has(key)) order.push(key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // A "heading" backed by only a couple of chunks is almost always a
  // false positive from the heuristic detector — a numbered list item
  // inside a paragraph ("3. Greutatea", "4. Înălțimea" from a growth-chart
  // list), not a real section break — rather than a genuinely short real
  // chapter. Left as-is, every one of those shows up as its own
  // one-fragment "chapter" and buries the real ones. Fold it into the
  // nearest preceding real heading instead of dropping it, so its content
  // still counts toward a chapter's total (it just isn't independently
  // selectable for chapter-scoped Discută/Generează/Flashcarduri).
  const MIN_CHUNKS_FOR_OWN_HEADING = 3;
  const mergedOrder: string[] = [];
  const mergedCounts = new Map<string, number>();
  for (const heading of order) {
    const count = counts.get(heading) ?? 0;
    const isReal = heading === WHOLE_DOCUMENT_HEADING || count >= MIN_CHUNKS_FOR_OWN_HEADING || mergedOrder.length === 0;
    const target = isReal ? heading : mergedOrder[mergedOrder.length - 1];
    if (!mergedCounts.has(target)) mergedOrder.push(target);
    mergedCounts.set(target, (mergedCounts.get(target) ?? 0) + count);
  }

  return mergedOrder.map((heading) => ({
    heading,
    label: heading === WHOLE_DOCUMENT_HEADING ? 'Document complet' : heading,
    chunkCount: mergedCounts.get(heading) ?? 0,
  }));
}
