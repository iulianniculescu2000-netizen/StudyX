import { getVaultChunksBySource } from '../../ai/vectorStore';
import { generateQuizPackagesFromSource } from './batchQuizGeneration';
import type { Difficulty, Folder, Quiz } from '../../types';
import type { QuestionType } from './questionTypes';
import type { ExamStyle } from './examStyle';

/** Same window size `studioGeneration.ts`'s `buildStudioContextPayload` uses per pack —
 *  sizing pack count off it means the generation calls collectively "see" the whole
 *  chapter instead of only ever sampling its first few chunks. */
const CHAPTER_CHUNK_WINDOW = 5;

/** Chunks with no detected heading are bucketed under this sentinel by `useSourceChapters`. */
export const WHOLE_DOCUMENT_HEADING = '__whole_document__';

interface ChapterGenerationOptions {
  sourceId: string;
  sourceName: string;
  heading: string;
  folder: Folder | null;
  folderId: string | null;
  questionCount: number;
  /** Rezidențiat (5 variante) sau grilă simplă de materie (4). */
  examStyle?: ExamStyle;
  difficulty: Difficulty | 'auto';
  activeProfileId: string | null;
  questionType?: 'single' | 'multiple';
  questionTypes?: QuestionType[];
  existingQuizzes?: Quiz[];
}

function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/**
 * Generates one quiz's worth of brand-new questions grounded only in a single chapter's
 * chunks (as opposed to `generateQuizPackagesFromSource`, which samples across the whole
 * source). Thin wrapper — reuses all of the batch pipeline's generation/dedup/quality-filter
 * logic, just with a pre-filtered chunk set and pack sizing based on chapter length, then
 * merges the resulting packs into a single quiz (one chapter = one quiz).
 */
interface ChapterGenerationResult {
  quiz: Quiz;
  difficulty: Difficulty;
  aiQuestionCount: number;
  fallbackQuestionCount: number;
  warnings: string[];
}

export async function generateQuizFromChapter({
  sourceId,
  sourceName,
  heading,
  folder,
  folderId,
  questionCount,
  difficulty,
  activeProfileId,
  questionType,
  questionTypes,
  examStyle,
  existingQuizzes = [],
}: ChapterGenerationOptions): Promise<ChapterGenerationResult> {
  const allChunks = await getVaultChunksBySource(sourceId);
  const chapterChunks = heading === WHOLE_DOCUMENT_HEADING
    ? allChunks
    : allChunks.filter((chunk) => chunk.heading === heading);

  if (chapterChunks.length === 0) {
    throw new Error('Nu am găsit conținut indexat pentru acest capitol.');
  }

  // Capped at `questionCount`: a pack can't usefully hold less than 1 question,
  // so more packs than questions asked for is pure waste, not extra spread.
  // A long chapter (many chunks) with a SMALL question count used to still run
  // one pack per CHAPTER_CHUNK_WINDOW-sized slice regardless — e.g. a 50-chunk
  // chapter sized 10 packs for a request of just 5 questions, generated 10
  // (each its own real API call + medical-judge pass), then threw away half
  // via the final .slice(0, questionCount) below. Every discarded question was
  // a fully-billed generation for nothing.
  const packCount = Math.max(1, Math.min(Math.ceil(chapterChunks.length / CHAPTER_CHUNK_WINDOW), questionCount));
  const questionsPerPack = Math.max(1, Math.ceil(questionCount / packCount));
  const titleContext = heading === WHOLE_DOCUMENT_HEADING ? undefined : heading;

  const result = await generateQuizPackagesFromSource({
    sourceId,
    sourceName,
    folder,
    folderId,
    packCount,
    questionsPerPack,
    difficulty,
    questionType,
    questionTypes,
    examStyle,
    activeProfileId,
    existingQuizzes,
    chunks: chapterChunks,
    titleContext,
  });

  const mergedQuestions = result.quizzes.flatMap((quiz) => quiz.questions).slice(0, questionCount);
  if (mergedQuestions.length === 0) {
    throw new Error('Nu am reușit să generăm întrebări pentru acest capitol.');
  }

  const titleLabel = titleContext ? `${sourceName} · ${titleContext}` : sourceName;
  const now = Date.now();

  const quiz: Quiz = {
    id: uid(),
    title: titleLabel,
    description: titleContext
      ? `Generat de AI din capitolul "${titleContext}" al documentului "${sourceName}", cu ${mergedQuestions.length} întrebări și dificultate ${result.difficulty}.`
      : `Generat de AI din documentul "${sourceName}" cu ${mergedQuestions.length} întrebări și dificultate ${result.difficulty}.`,
    emoji: folder?.emoji ?? '\u{1F4D8}',
    category: folder?.name ?? 'AI Studio',
    kind: 'quiz',
    folderId,
    color: folder?.color ?? 'blue',
    questions: mergedQuestions,
    createdAt: now,
    updatedAt: now,
    shuffleQuestions: true,
    shuffleAnswers: true,
    // No 'rezidentiat' tag here: it is added when the set is filed into the Rezidențiat tree,
    // not merely because the questions use the exam format (which would hide them from
    // "Toate grilele" wherever they end up).
    tags: titleContext ? ['ai-studio', 'chapter-pack', sourceName, titleContext] : ['ai-studio', 'document-pack', sourceName],
  };

  return {
    quiz,
    difficulty: result.difficulty,
    aiQuestionCount: result.aiQuestionCount,
    fallbackQuestionCount: result.fallbackQuestionCount,
    warnings: result.warnings,
  };
}
