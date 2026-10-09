/**
 * The curriculum chapter (from `src/lib/curriculum.ts`) as context for the AI assistant: which chapter a
 * question is about, which book and pages, and — when the book is indexed in the library — the text of that
 * chapter, clipped to a fixed size. When the text is not indexed the context says so, so the model does not
 * pretend to quote the book.
 */
import { useAIStore } from '../../store/aiStore';
import { getVaultChunksBySource } from '../../ai/vectorStore';
import type { ChunkRecord } from '../../ai/types';
import {
  BOOK_NAMES,
  bookOfSourceName,
  chapterForHeading,
  chapterTopics,
  curriculumChapters,
  type CurriculumChapter,
} from '../curriculum';
import { fold } from '../organizare/format';
import { getChapterFullText } from './bookChapterText';
import { groupChunksIntoChapters } from './chapterGrouping';
import { WHOLE_DOCUMENT_HEADING } from './chapterQuizGeneration';

/** Characters of chapter text sent along with a question. */
export const CHAPTER_TEXT_LIMIT = 6000;

export const NOT_INDEXED_NOTE =
  'Textul acestui capitol nu e indexat în bibliotecă. Nu cita și nu inventa conținut din carte; răspunde din cunoștințe medicale generale și spune explicit că nu ai textul cărții.';

export interface ChapterScope {
  sourceId: string;
  sourceName: string;
  heading: string;
}

export interface ChapterContext {
  /** Block to put in front of the model's context. */
  context: string;
  /** The indexed book and heading the chapter was found in, when there is one. */
  scope: ChapterScope | null;
}

export interface ChapterContextDeps {
  sources: () => Array<{ id: string; name: string; indexStatus: string }>;
  chunks: (sourceId: string) => Promise<Array<Pick<ChunkRecord, 'heading' | 'text'>>>;
  text: (sourceId: string, heading: string) => Promise<string>;
}

const defaultDeps: ChapterContextDeps = {
  sources: () => useAIStore.getState().knowledgeSources,
  chunks: (sourceId) => getVaultChunksBySource(sourceId),
  text: getChapterFullText,
};

/** The heading of an indexed book that is this chapter, or null. Headings are in document order. */
export function pickChapterHeading(chapter: CurriculumChapter, headings: string[]): string | null {
  for (const heading of headings) {
    if (heading === WHOLE_DOCUMENT_HEADING) continue;
    if (chapterForHeading(heading, chapter.book)?.index === chapter.index) return heading;
  }
  return null;
}

const words = (text: string) => fold(text).split(/[^a-z0-9]+/).filter((word) => word.length > 3);

/**
 * At most `limit` characters of `text`. Over the limit, the paragraphs that share the most words with `focus`
 * are kept (in their original order); without a focus, the beginning is kept.
 */
export function clipChapterText(text: string, limit = CHAPTER_TEXT_LIMIT, focus = ''): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const paragraphs = clean.split(/\n{2,}/);
  const wanted = new Set(words(focus));
  const scored = paragraphs.map((paragraph, order) => ({
    paragraph,
    order,
    score: wanted.size ? words(paragraph).filter((word) => wanted.has(word)).length : 0,
  }));
  const ranked = wanted.size ? [...scored].sort((a, b) => b.score - a.score || a.order - b.order) : scored;
  const kept: typeof scored = [];
  let used = 0;
  for (const item of ranked) {
    const cost = item.paragraph.length + 2;
    if (used + cost > limit) {
      if (kept.length === 0) kept.push({ ...item, paragraph: item.paragraph.slice(0, limit) });
      break;
    }
    kept.push(item);
    used += cost;
  }
  return kept.sort((a, b) => a.order - b.order).map((item) => item.paragraph).join('\n\n');
}

/** One line that names the chapter, its book, its pages and its topics. */
export function chapterHeaderLine(chapter: CurriculumChapter): string {
  const topics = chapterTopics(chapter).map((topic) => topic.name).join('; ');
  return `Capitol curricular ${chapter.number}/${curriculumChapters().length}: ${chapter.title} — ${BOOK_NAMES[chapter.book]}, ${chapter.pages} pagini. Topicuri: ${topics}.`;
}

/**
 * Builds the context block for a chapter, optionally focused on one topic. Never throws: when the library
 * cannot be read the chapter is simply treated as not indexed.
 */
export async function buildChapterContext(
  chapter: CurriculumChapter,
  options: { topicName?: string; topicSrc?: string } = {},
  deps: ChapterContextDeps = defaultDeps,
): Promise<ChapterContext> {
  const lines = ['[CAPITOL CURRICULAR]', chapterHeaderLine(chapter)];
  if (options.topicName) lines.push(`Topic discutat: ${options.topicName}${options.topicSrc ? ` (${options.topicSrc})` : ''}.`);

  let scope: ChapterScope | null = null;
  let body = '';
  try {
    const candidates = deps.sources().filter((source) => source.indexStatus === 'ready' && bookOfSourceName(source.name) === chapter.book);
    for (const source of candidates) {
      const chunks = await deps.chunks(source.id);
      const heading = pickChapterHeading(chapter, groupChunksIntoChapters(chunks as ChunkRecord[]).map((item) => item.heading));
      if (!heading) continue;
      const full = await deps.text(source.id, heading);
      if (!full.trim()) continue;
      scope = { sourceId: source.id, sourceName: source.name, heading };
      body = clipChapterText(full, CHAPTER_TEXT_LIMIT, options.topicName ?? '');
      break;
    }
  } catch {
    scope = null;
    body = '';
  }

  if (body) lines.push(`Text indexat din capitol (fragmente, pot lipsi părți):\n"""\n${body}\n"""`);
  else lines.push(NOT_INDEXED_NOTE);
  return { context: lines.join('\n'), scope };
}

/**
 * The chapter a free-text question is about, when it names one outright ("explică-mi capitolul Sepsisul și
 * tratamentul infecțiilor bacteriene"). Needs the word „capitol” and the chapter's title, so a passing mention
 * of a specialty does not attach thousands of characters of book text.
 */
export function detectChapterInQuestion(text: string): CurriculumChapter | null {
  const folded = fold(text);
  if (!folded.includes('capitol')) return null;
  let best: CurriculumChapter | null = null;
  for (const chapter of curriculumChapters()) {
    const title = fold(chapter.title).trim();
    if (title.length >= 8 && folded.includes(title) && (!best || title.length > fold(best.title).length)) best = chapter;
  }
  return best;
}
