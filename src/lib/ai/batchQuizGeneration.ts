import { generateQuestions, getAdaptiveDifficulty, getUserProfile } from '../../ai/AIEngine';
import { getWeakTopicsForProfile } from '../../ai/UserProfile';
import { getVaultChunksBySource } from '../../ai/vectorStore';
import type { ChunkRecord } from '../../ai/types';
import type { Difficulty, Folder, Quiz } from '../../types';
import { friendlyAIError, rateLimitWaitSeconds } from './friendlyError';
import type { QuestionType } from './questionTypes';
import { DEFAULT_EXAM_STYLE, EXAM_STYLE_META, examStyleTags, type ExamStyle } from './examStyle';
import {
  STUDIO_AI_BATCH_SIZE,
  STUDIO_MAX_PACK_COUNT,
  STUDIO_MAX_QUESTIONS_PER_PACK,
  buildFallbackQuestionsFromChunks,
  buildStudioContextPayload,
  clampStudioPackCount,
  clampStudioQuestionCount,
  isStudioQuestionQualityAcceptable,
} from './studioGeneration';

type BatchDifficulty = Difficulty | 'auto';

interface BatchGenerationOptions {
  sourceId: string;
  sourceName: string;
  folder: Folder | null;
  folderId: string | null;
  packCount: number;
  questionsPerPack: number;
  difficulty: BatchDifficulty;
  questionType?: 'single' | 'multiple';
  questionTypes?: QuestionType[];
  /** Rezidențiat (5 variante A-E) sau grilă simplă de materie (4, A-D). */
  examStyle?: ExamStyle;
  activeProfileId: string | null;
  existingQuizzes?: Quiz[];
  /** Skip the vault fetch and use this chunk set instead (e.g. one chapter's chunks). */
  chunks?: ChunkRecord[];
  /** Folded into each pack's title/description/tags — e.g. a chapter/heading name. */
  titleContext?: string;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function questionSignature(question: Quiz['questions'][number]) {
  const correct = question.options.find((option) => option.isCorrect)?.text ?? '';
  return `${question.text}::${correct}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function pickPackDifficulty(requested: BatchDifficulty, activeProfileId: string | null): Difficulty {
  if (requested !== 'auto') return requested;
  if (!activeProfileId) return 'medium';

  const profile = getUserProfile(activeProfileId);
  return getAdaptiveDifficulty({
    accuracy: profile.globalAccuracy,
    streak: profile.streak,
  });
}

export async function generateQuizPackagesFromSource({
  sourceId,
  sourceName,
  folder,
  folderId,
  packCount,
  questionsPerPack,
  difficulty,
  questionType = 'single',
  questionTypes,
  examStyle = DEFAULT_EXAM_STYLE,
  activeProfileId,
  existingQuizzes = [],
  chunks: chunksOverride,
  titleContext,
}: BatchGenerationOptions) {
  const chunks = chunksOverride ?? await getVaultChunksBySource(sourceId);
  if (chunks.length === 0) {
    throw new Error('Nu am găsit suficient conținut indexat pentru documentul selectat.');
  }

  const targetDifficulty = pickPackDifficulty(difficulty, activeProfileId);
  const weakTopics = activeProfileId ? getWeakTopicsForProfile(activeProfileId) : [];
  const profile = activeProfileId ? getUserProfile(activeProfileId) : null;
  const normalizedPackCount = clampStudioPackCount(packCount);
  const normalizedQuestionCount = clampStudioQuestionCount(questionsPerPack);

  const quizzes: Quiz[] = [];
  const warnings: string[] = [];
  let aiQuestionCount = 0;
  let fallbackQuestionCount = 0;
  let medicallyFlaggedCount = 0;
  const globalSeenQuestionSignatures = new Set(
    existingQuizzes.flatMap((quiz) => quiz.questions.map(questionSignature)),
  );

  // Generate packs in parallel — up to 2 at a time to avoid rate-limit spikes.
  const PACK_CONCURRENCY = 2;
  const packIndexes = Array.from({ length: normalizedPackCount }, (_, i) => i);

  type PackResult =
    // `fallbackIds` marks which questions came from the local template builder
    // rather than the AI. Counting them by sniffing for an `isFallback` field
    // never worked — the builder never set one, so the count was always zero and
    // the user was never told a pack was locally generated.
    | { ok: true; packIndex: number; questions: Quiz['questions']; warning: string | null; fallbackIds: Set<string>; medicallyFlagged: number }
    | { ok: false; packIndex: number; error: string };

  const generatePack = async (packIndex: number): Promise<PackResult> => {
    const packQuestions: Quiz['questions'] = [];
    const seenPackSignatures = new Set<string>(globalSeenQuestionSignatures);
    let aiError: string | null = null;
    let medicallyFlagged = 0;

    for (let offset = 0; offset < normalizedQuestionCount; offset += STUDIO_AI_BATCH_SIZE) {
      const batchCount = Math.min(STUDIO_AI_BATCH_SIZE, normalizedQuestionCount - offset);
      const contextPayload = buildStudioContextPayload({
        sourceName,
        chunks,
        packIndex: packIndex + Math.floor(offset / STUDIO_AI_BATCH_SIZE),
        totalPacks: normalizedPackCount,
        difficulty: targetDifficulty,
        weakTopics,
      });

      try {
        const request = () => generateQuestions({
          context: contextPayload.query,
          prefetchedContext: contextPayload,
          // Pachetul rămâne pe fragmentele alese; topicurile slabe din alte teme nu intră în prompt.
          subject: contextPayload.query.replace(/^Întrebări despre\s+/i, ''),
          count: batchCount,
          difficulty: targetDifficulty,
          userProfile: profile ?? undefined,
          mode: 'standard',
          questionType,
          questionTypes,
          examStyle,
        });
        // O singură reîncercare pentru erori trecătoare (răspuns gol/trunchiat);
        // limitele de utilizare nu se reîncearcă, ar agrava situația.
        let result;
        try {
          result = await request();
        } catch (firstError) {
          if (isAbortError(firstError) || rateLimitWaitSeconds(firstError) !== null) throw firstError;
          result = await request();
        }

        medicallyFlagged += result.medicallyFlaggedCount ?? 0;
        result.questions
          .filter((q) => isStudioQuestionQualityAcceptable(q, sourceName))
          .filter((q) => !seenPackSignatures.has(questionSignature(q)))
          .forEach((q) => {
            packQuestions.push(q);
            seenPackSignatures.add(questionSignature(q));
          });
      } catch (error) {
        if (isAbortError(error)) throw error;
        aiError = friendlyAIError(error);
        break;
      }
    }

    const fallbackIds = new Set<string>();
    if (packQuestions.length < normalizedQuestionCount) {
      const fallback = buildFallbackQuestionsFromChunks({
        sourceName,
        chunks,
        count: normalizedQuestionCount - packQuestions.length,
        difficulty: targetDifficulty,
        packIndex,
      }).filter((q) => !seenPackSignatures.has(questionSignature(q)));
      fallback.forEach((q) => fallbackIds.add(q.id));
      packQuestions.push(...fallback);
    }

    if (packQuestions.length === 0) {
      return { ok: false, packIndex, error: aiError ?? 'Nu am reușit să generăm întrebări.' };
    }

    return { ok: true, packIndex, questions: packQuestions, warning: aiError, fallbackIds, medicallyFlagged };
  };

  // Run packs in batches of PACK_CONCURRENCY.
  for (let start = 0; start < packIndexes.length; start += PACK_CONCURRENCY) {
    const batch = packIndexes.slice(start, start + PACK_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(generatePack));

    for (const settled of results) {
      const result: PackResult = settled.status === 'fulfilled'
        ? settled.value
        : { ok: false, packIndex: -1, error: String((settled as PromiseRejectedResult).reason) };

      if (!result.ok) {
        if (quizzes.length === 0 && start === 0) {
          throw new Error(result.error);
        }
        warnings.push(`Pachetul ${result.packIndex + 1} a eșuat: ${result.error}`);
        continue;
      }

      // Dedup against globally seen signatures (packs ran in parallel, check now).
      const dedupedQuestions = result.questions.filter(
        (q) => !globalSeenQuestionSignatures.has(questionSignature(q)),
      );
      dedupedQuestions.forEach((q) => globalSeenQuestionSignatures.add(questionSignature(q)));

      // Counted after dedup, by id, so a fallback question dropped as a
      // duplicate isn't still reported as generated.
      const fbCount = dedupedQuestions.filter((q) => result.fallbackIds.has(q.id)).length;
      const aiCount = dedupedQuestions.length - fbCount;
      aiQuestionCount += aiCount;
      fallbackQuestionCount += fbCount;

      if (result.warning) {
        warnings.push(`Pachetul ${result.packIndex + 1} a folosit fallback: ${result.warning}`);
      } else if (fbCount > 0) {
        // The AI didn't error, it just returned too few questions — previously
        // this case passed completely unreported.
        warnings.push(`Pachetul ${result.packIndex + 1}: ${fbCount} întrebări completate local, AI-ul a returnat prea puține.`);
      }
      if (result.medicallyFlagged > 0) {
        medicallyFlaggedCount += result.medicallyFlagged;
        warnings.push(`Pachetul ${result.packIndex + 1}: ${result.medicallyFlagged} întrebări eliminate de verificarea medicală (răspuns marcat greșit).`);
      }

      const packNumber = result.packIndex + 1;
      const titleSuffix = normalizedPackCount === 1 ? 'Set premium' : `Set premium ${packNumber}`;
      const titleLabel = titleContext ? `${sourceName} · ${titleContext}` : sourceName;
      quizzes.push({
        id: uid(),
        title: `${titleLabel} · ${titleSuffix}`,
        description: titleContext
          ? `Generat de AI Studio din capitolul "${titleContext}" al documentului "${sourceName}", cu ${dedupedQuestions.length} întrebări, dificultate ${targetDifficulty} · ${EXAM_STYLE_META[examStyle].description}.`
          : `Generat de AI Studio din documentul "${sourceName}" cu ${dedupedQuestions.length} întrebări, dificultate ${targetDifficulty} · ${EXAM_STYLE_META[examStyle].description}.`,
        emoji: folder?.emoji ?? '\u{1F9E0}',
        category: folder?.name ?? 'AI Studio',
        kind: 'quiz',
        folderId,
        color: folder?.color ?? 'blue',
        questions: dedupedQuestions,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        shuffleQuestions: true,
        shuffleAnswers: true,
        tags: [
          ...examStyleTags(examStyle),
          'ai-studio',
          ...(titleContext ? ['chapter-pack', sourceName, titleContext] : ['document-pack', sourceName]),
        ],
      });
    }
  }

  return {
    quizzes,
    difficulty: targetDifficulty,
    sourceCount: chunks.length,
    aiQuestionCount,
    fallbackQuestionCount,
    medicallyFlaggedCount,
    warnings,
    limits: {
      maxPacks: STUDIO_MAX_PACK_COUNT,
      maxQuestionsPerPack: STUDIO_MAX_QUESTIONS_PER_PACK,
    },
  };
}
