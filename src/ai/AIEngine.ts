import { explainAbbreviations } from '../lib/ai/medicalAbbreviations';
import type { Difficulty, Question } from '../types';
import { groqRequest, groqStream } from '../lib/groq';
import { logAIDebug } from './debug';
import { DEFAULT_EXAM_STYLE, type ExamStyle } from '../lib/ai/examStyle';
import { runAIPipeline } from './pipeline';
import { requestStructuredOrThrow } from '../lib/ai/structured';
import { AnalysisResultSchema, QuestionsBatchSchema } from '../lib/ai/schemas';
import {
  buildExplanationPrompt,
  buildHintPrompt,
  buildMnemonicPrompt,
  buildQuestionPrompt,
  buildWrongOptionsPrompt,
} from './prompts';
import { retrieveRelevantChunks } from './retriever';
import type {
  AIAnalysisResult,
  AIContextPayload,
  AIQuestionRequest,
  AIQuestionResult,
  AdaptiveDifficultyInput,
  ChunkRecord,
  ExplainWrongOptionsResult,
  HintResult,
  QuestionGenerationResponse,
  RetrievedChunk,
  UserProfileData,
} from './types';
import { loadUserProfile, updateUserProfileAfterAnswer, getWeakTopicsForProfile } from './UserProfile';
import { validateJson } from './validator';
import { verifyQuestionsMedically } from './medicalJudge';
import { fitHistoryToBudget, type StudentState } from './chatMemory';
import { composeChatSystemPrompt } from './promptKit';
import { compactOldAssistantTurns, logPromptBreakdown } from '../lib/ai/tokenBudget';
import { avoidInstruction, fillShortfall } from '../lib/ai/questionTopUp';
import { isAppQuestion } from '../lib/ai/routerPolicy';

type ContextChunk = ChunkRecord | RetrievedChunk;

/** Shapes shown to the model in the (single) JSON repair pass. */
const QUESTIONS_SCHEMA_HINT = '{"questions":[{"text":"...","options":[{"text":"...","isCorrect":true|false}],"explanation":"...","tags":["..."],"difficulty":"easy|medium|hard"}]}';
const ANALYSIS_SCHEMA_HINT = '{"explanation":"...","mistakeType":"...","rule":"...","confidence":0.0-1.0,"missingConcept":"...","recommendedTopic":"...","relatedConcepts":["..."],"sources":["..."]}';
export type ChatMode = 'grounded' | 'explain' | 'summarize' | 'diagram' | 'test' | 'mnemonic';

// Per-mode sampling temperature. Creative modes (mnemonic) need more freedom or
// the model just echoes the source text; factual modes stay low for precision.
const CHAT_MODE_TEMPERATURE: Record<ChatMode, number> = {
  grounded: 0.5,
  explain: 0.45,
  summarize: 0.4,
  diagram: 0.5,
  test: 0.6,
  mnemonic: 0.85,
};

interface ChatResponseOptions {
  mode?: ChatMode;
  hasContext?: boolean;
  scopedSourceName?: string;
  /** Forțează (true) sau oprește (false) modulul „carte”; implicit se deduce din sursă și din context. */
  bookMode?: boolean;
  studyContext?: string;
  focusTopics?: string[];
  /** Compressed summary of earlier turns, injected when the thread grows long. */
  conversationSummary?: string;
  /** Durable facts about the student (already filtered for relevance), one per line. */
  personalMemory?: string;
  /** How the student seems to be doing right now, derived from their message and the clock. */
  tone?: { state: StudentState; late: boolean };
  /** Grila pe care o discută studentul acum; intră în prompt chiar când biblioteca nu a dat fragmente. */
  tutorContext?: string;
  /** Conversația recentă a cerut o schemă: regulile de schemă rămân și la mesaje scurte („nu văd schema”). */
  recentDiagram?: boolean;
  /** Apelat când răspunsul începe, cu furnizorul/modelul care l-a dat. */
  onServed?: (info: { provider: string; model: string }) => void;
  /** Apelat la sfârșitul fluxului cu `finish_reason` al furnizorului (`length` = răspuns tăiat la limita de tokeni). */
  onFinish?: (reason: string | null) => void;
}

async function buildRelevantContext(query: string, limit: number, userProfile?: UserProfileData | null) {
  const chunks = await retrieveRelevantChunks(query, userProfile ?? null, limit);
  return {
    chunks,
    summary: chunks.map((chunk) => `[Sursă: ${chunk.source}]\n${chunk.text}`).join('\n\n'),
  };
}

function uniqueSourceList(chunks: ContextChunk[]) {
  const seen = new Set<string>();
  const sources: string[] = [];

  chunks.forEach((chunk) => {
    const label = `${chunk.source} - ${chunk.topic}`;
    if (seen.has(label)) return;
    seen.add(label);
    sources.push(label);
  });

  return sources;
}

function clampConfidence(value: number | undefined, fallback = 0.72) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeQuestion(question: QuestionGenerationResponse['questions'][number], index: number): Question {
  // Guard against a malformed single item (model omitted "options" for just
  // that one question) — drop its options instead of throwing and losing the
  // whole batch; sanitizeGeneratedQuestions filters it out right after anyway.
  const options = (Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => ({
    id: `${index}-${optionIndex}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`,
    text: option?.text ?? '',
    isCorrect: Boolean(option?.isCorrect),
  }));
  const correctCount = options.filter((option) => option.isCorrect).length;
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    text: question.text,
    options,
    multipleCorrect: correctCount > 1,
    explanation: question.explanation,
    tags: question.tags,
    difficulty: (question.difficulty as Difficulty) ?? 'medium',
    ...(question.type ? { type: question.type } : {}),
  };
}

/** Loose comparison key for spotting option texts that are the same answer twice. */
function optionKey(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Drops generated questions that cannot be answered, and de-duplicates repeated
 * options. Nothing validated model output before this: a reply could yield a
 * question with an empty stem, with no correct option at all, or with the same
 * distractor twice — and it was saved as a real quiz the user then studied.
 */
export function sanitizeGeneratedQuestions(questions: Question[]): Question[] {
  const usable: Question[] = [];

  for (const question of questions) {
    if (!question.text || question.text.trim().length < 6) continue;

    const seen = new Set<string>();
    const options = question.options.filter((option) => {
      const key = optionKey(option.text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (options.length < 2) continue;
    const correctCount = options.filter((option) => option.isCorrect).length;
    if (correctCount === 0) continue; // unanswerable

    usable.push({ ...question, options, multipleCorrect: correctCount > 1 });
  }

  return usable;
}

function normalizeAnalysisResult(result: AIAnalysisResult, context: AIContextPayload): AIAnalysisResult {
  const chunks = (context.chunks as ContextChunk[] | undefined) ?? [];
  const fallbackSources = uniqueSourceList(chunks).slice(0, 4);
  const contextScores = chunks
    .map((chunk) => ('score' in chunk ? chunk.score : 0))
    .filter((score) => typeof score === 'number' && Number.isFinite(score));
  const averageScore = contextScores.length > 0
    ? contextScores.reduce((sum, score) => sum + score, 0) / contextScores.length
    : 0.72;

  return {
    ...result,
    confidence: clampConfidence(result.confidence, averageScore),
    rule: result.rule?.trim() || 'Compară mai atent mecanismul-cheie și elimină variantele care nu îl susțin.',
    missingConcept: result.missingConcept?.trim() || context.query,
    recommendedTopic: result.recommendedTopic?.trim() || chunks[0]?.topic || 'Concept de bază',
    relatedConcepts: (result.relatedConcepts ?? []).filter(Boolean).slice(0, 5),
    sources: (result.sources ?? []).filter(Boolean).slice(0, 4).length > 0
      ? (result.sources ?? []).filter(Boolean).slice(0, 4)
      : fallbackSources,
  };
}

export class QuestionGenerator {
  /**
   * Generează `request.count` întrebări. Dacă filtrele (format, verificare medicală, dubluri) lasă mai puține, cere
   * doar diferența, de cel mult două ori (vezi `fillShortfall`), cu contextul deja regăsit.
   */
  static async generate(profile: UserProfileData | null, request: AIQuestionRequest): Promise<AIQuestionResult> {
    const target = request.count ?? 1;
    const first = await QuestionGenerator.generateOnce(profile, request);
    // Modelul întoarce uneori mai multe decât s-a cerut („30 cerute, 33 primite”): se păstrează exact cât s-a cerut.
    if (first.questions.length >= target) return { ...first, questions: first.questions.slice(0, target), requested: target, topUpRounds: 0 };
    const filled = await fillShortfall({
      target,
      first,
      generateMore: (need, avoidTexts) => QuestionGenerator.generateOnce(profile, { ...request, count: need, avoidTexts: [...(request.avoidTexts ?? []), ...avoidTexts] }),
    });
    return {
      ...first,
      questions: filled.questions,
      medicallyFlaggedCount: filled.medicallyFlaggedCount,
      malformedDroppedCount: filled.malformedDroppedCount,
      flaggedReasons: filled.flaggedReasons,
      requested: target,
      topUpRounds: filled.rounds,
    };
  }

  private static async generateOnce(profile: UserProfileData | null, request: AIQuestionRequest): Promise<AIQuestionResult> {
    // Cu subiect obligatoriu, topicurile slabe ale studentului nu intră deloc: ele mutau întrebările pe alte patologii.
    const weakTopics = request.subject ? [] : (request.weakTopics ?? (profile ? getWeakTopicsForProfile(profile.profileId) : []));
    const difficulty = request.difficulty ?? profile?.currentDifficulty ?? 'medium';
    const query = request.context || 'Cunoștințe medicale generale';
    let context: AIContextPayload;

    if (request.prefetchedContext) {
      context = {
        ...request.prefetchedContext,
        query: request.prefetchedContext.query || query,
        summary: request.prefetchedContext.summary
          || ((request.prefetchedContext.chunks ?? []).map((chunk) => `[Sursă: ${chunk.source}]\n${chunk.text}`).join('\n\n')),
        weakTopics: request.prefetchedContext.weakTopics ?? weakTopics,
        level: request.prefetchedContext.level ?? difficulty,
      };
    } else {
      const { chunks, summary } = await buildRelevantContext(query, 10);
      context = {
        summary,
        chunks,
        query,
        weakTopics,
        level: difficulty,
      };
    }

    const prompt = buildQuestionPrompt(
      profile,
      weakTopics,
      difficulty,
      context,
      request.questionType ?? 'single',
      request.questionTypes,
      request.count ?? 1,
      request.examStyle ?? DEFAULT_EXAM_STYLE,
      request.subject,
    );
    // Self-gated by the localStorage "studyx-ai-debug" flag (see debug.ts).
    logAIDebug('buildQuestionPrompt', { questionTypes: request.questionTypes, count: request.count, prompt });
    // One structured-output layer (JSON mode → tolerant parse → zod → a single repair that
    // carries the broken reply, so the model fixes it instead of inventing a fresh quiz).
    const parsed = await requestStructuredOrThrow({
      schema: QuestionsBatchSchema,
      schemaHint: QUESTIONS_SCHEMA_HINT,
      label: 'generateQuestions',
      task: 'questions',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Generează ${request.count ?? 1} întrebări în JSON strict, exclusiv în limba română, pe baza contextului furnizat.${avoidInstruction(request.avoidTexts)}` },
      ],
      // Context is already embedded in the prompt above; skip the duplicate
      // library injection to avoid burning Groq's daily token quota.
      skipLibraryContext: true,
    });

    const sanitized = sanitizeGeneratedQuestions(parsed.questions.map(normalizeQuestion));
    const judged = await verifyQuestionsMedically(sanitized, context.summary);

    return {
      questions: judged.questions,
      sources: uniqueSourceList((context.chunks as ContextChunk[] | undefined) ?? []),
      mode: request.mode ?? 'standard',
      medicallyFlaggedCount: judged.flaggedCount,
      flaggedReasons: judged.flaggedReasons,
    };
  }
}

/**
 * Generate questions for a freeform TOPIC with NO library grounding — deliberately
 * skips `buildRelevantContext` (the RAG lookup `QuestionGenerator.generate` always
 * does). That lookup returns the closest chunks it can find in the user's library
 * even when nothing relevant exists, and the prompt's "use library context first"
 * rule then makes the model dutifully ground an unrelated topic in whatever got
 * retrieved — e.g. asking for "mielom multiplu" (hematology) with a dermatology-only
 * library silently produced dermatology questions. Passing no context at all means
 * there's nothing to (wrongly) ground in, so the model falls back to its own
 * general medical knowledge, as the prompt's rules already allow.
 */
export async function generateQuestionsFromTopic(
  topic: string,
  count: number,
  difficulty: Difficulty,
  questionType: 'single' | 'multiple',
  profile: UserProfileData | null,
  examStyle: ExamStyle = DEFAULT_EXAM_STYLE,
): Promise<AIQuestionResult> {
  const first = await generateQuestionsFromTopicOnce(topic, count, difficulty, questionType, profile, examStyle, []);
  // Modelul întoarce uneori mai multe decât s-a cerut („30 cerute, 33 primite”): se păstrează exact cât s-a cerut.
  if (first.questions.length >= count) return { ...first, questions: first.questions.slice(0, count), requested: count, topUpRounds: 0 };
  // „5 cerute, 2 primite”: cere doar diferența (cu enunțurile existente la „nu repeta”), de cel mult două ori.
  const filled = await fillShortfall({
    target: count,
    first,
    generateMore: (need, avoidTexts) => generateQuestionsFromTopicOnce(topic, need, difficulty, questionType, profile, examStyle, avoidTexts),
  });
  return {
    ...first,
    questions: filled.questions,
    medicallyFlaggedCount: filled.medicallyFlaggedCount,
    malformedDroppedCount: filled.malformedDroppedCount,
    flaggedReasons: filled.flaggedReasons,
    requested: count,
    topUpRounds: filled.rounds,
  };
}

async function generateQuestionsFromTopicOnce(
  topic: string,
  count: number,
  difficulty: Difficulty,
  questionType: 'single' | 'multiple',
  profile: UserProfileData | null,
  examStyle: ExamStyle,
  avoidTexts: string[],
): Promise<AIQuestionResult> {
  // TASK_MAX_TOKENS.questions (groq.ts) is a flat 2200-token budget meant for
  // a handful of questions — it doesn't scale with `count`. This is the one
  // caller that can ask for up to 60 questions in a SINGLE completion
  // (chapter/pack generation elsewhere batches in smaller chunks). A
  // residency-style question alone (5 lettered options, an explanation, a
  // vignette stem for medium/hard difficulty) commonly runs 150-250 tokens,
  // so 10 questions already sits at or past the flat cap — the response gets
  // cut off mid-JSON, fails validation, and the one repair attempt can't
  // recover missing content (it's told explicitly not to invent any). This
  // was reproduced live: "10 grile despre arsuri" (residency style) failed
  // this way twice in a row. Scaling the budget with `count` instead of a
  // constant fixes it for any topic/size, not just this one.
  const maxTokens = Math.min(8000, Math.max(2200, count * 220 + 300));

  // „AR” poate fi artrită reumatoidă, aritmie ș.a.: subiectul merge spre model cu abrevierea explicată.
  const subject = explainAbbreviations(topic);
  const topicPrompt = buildQuestionPrompt(profile, [], difficulty, undefined, questionType, undefined, count, examStyle, subject);
  const parsed = await requestStructuredOrThrow({
    schema: QuestionsBatchSchema,
    schemaHint: QUESTIONS_SCHEMA_HINT,
    label: 'generateQuestionsFromTopic',
    task: 'questions',
    maxTokens,
    messages: [
      { role: 'system', content: topicPrompt },
      {
        role: 'user',
        content: `Generează ${count} întrebări în JSON strict, exclusiv în limba română, despre subiectul: ${subject}. Folosește cunoștințe medicale generale — nu ai context din bibliotecă pentru acest subiect.${avoidInstruction(avoidTexts)}`,
      },
    ],
    skipLibraryContext: true,
  });

  const sanitized = sanitizeGeneratedQuestions(parsed.questions.map(normalizeQuestion));
  // Silent before this: the model returning fewer than `count` items to begin
  // with, or one item in an otherwise-fine batch glitching (empty text, no
  // options left after dedup, no option marked correct) and getting dropped
  // by sanitizeGeneratedQuestions — either way "asked for 10, got 7" had zero
  // explanation anywhere in the UI. Tracked the same way medicallyFlaggedCount
  // already was, and surfaced by the same warning in agent.ts's
  // generate_quiz_topic step. Deliberately NOT the same bucket as the medical
  // judge's drops below — that's an intentional safety filter, this is a
  // shortfall against what was actually asked for.
  const malformedDroppedCount = Math.max(0, count - sanitized.length);
  const judged = await verifyQuestionsMedically(sanitized, undefined);

  if (judged.questions.length === 0 && import.meta.env.DEV) {
    // Dev-only diagnostic: pinpoint WHERE the batch got dropped to zero —
    // the raw model output, or sanitize, or the medical judge — since the
    // generic "couldn't generate" error alone doesn't say which.
    console.error('[StudyX AI] generateQuestionsFromTopic produced 0 questions ' + JSON.stringify({
      topic,
      examStyle,
      rawParsedCount: parsed.questions?.length ?? 0,
      rawParsedSample: parsed.questions?.[0],
      sanitizedCount: sanitized.length,
      flaggedCount: judged.flaggedCount,
      flaggedReasons: judged.flaggedReasons,
    }, null, 2));
  }

  return {
    questions: judged.questions,
    sources: [],
    mode: 'standard',
    medicallyFlaggedCount: judged.flaggedCount,
    malformedDroppedCount,
    flaggedReasons: judged.flaggedReasons,
  };
}

export async function analyzeAnswer(
  profileId: string,
  payload: { question: Question; userAnswer: string; correctAnswer: string; isCorrect: boolean },
) {
  const query = `${payload.question.text} ${payload.correctAnswer}`;
  const profile = loadUserProfile(profileId);
  const { chunks, summary } = await buildRelevantContext(query, 5, profile);

  const context: AIContextPayload = {
    summary,
    chunks,
    query,
    level: payload.question.difficulty,
  };

  const rawAnalysis = await requestStructuredOrThrow({
    schema: AnalysisResultSchema,
    schemaHint: ANALYSIS_SCHEMA_HINT,
    label: 'analyzeAnswer',
    task: 'explanation',
    messages: [
      { role: 'system', content: buildExplanationPrompt(payload.userAnswer, payload.correctAnswer, payload.question, context) },
      { role: 'user', content: 'Analizează răspunsul și returnează JSON-ul solicitat, exclusiv în limba română.' },
    ],
    skipLibraryContext: true,
  }) as AIAnalysisResult;

  const analysis = normalizeAnalysisResult(rawAnalysis, context);
  const nextProfile = updateUserProfileAfterAnswer(profileId, { ...payload, analysis });
  return { analysis, profile: nextProfile };
}

export async function generateQuestions(request: AIQuestionRequest) {
  const profile = request.userProfile ?? null;
  return QuestionGenerator.generate(profile, request);
}

export async function generateHint(question: Question) {
  const query = question.text;
  const { chunks, summary } = await buildRelevantContext(query, 4);

  const context: AIContextPayload = {
    summary,
    query,
    chunks,
    level: question.difficulty,
  };

  return runAIPipeline<HintResult>({
    retrieve: () => context.summary,
    generate: () => (
      groqRequest({
        task: 'hint',
        messages: [
          { role: 'system', content: buildHintPrompt(question, context) },
          { role: 'user', content: 'Returnează indicii progresive în JSON, integral în română.' },
        ],
        skipLibraryContext: true,
      })
    ),
    validate: (raw) => {
      const result = validateJson<HintResult>(raw);
      return result.ok && result.value?.full ? result.value : null;
    },
  });
}

export async function generateMnemonicForConcept(concept: string, correctAnswer: string) {
  const query = `${concept} ${correctAnswer}`;
  const { chunks, summary } = await buildRelevantContext(query, 3);

  const context: AIContextPayload = {
    summary,
    query,
    chunks,
  };

  const raw = await groqRequest({
    task: 'mnemonic',
    messages: [
      { role: 'system', content: buildMnemonicPrompt(concept, context) },
      { role: 'user', content: `Creează un mnemonic creativ în JSON, integral în română, pentru a reține răspunsul "${correctAnswer}" la conceptul "${concept}".` },
    ],
    skipLibraryContext: true,
  });

  const parsed = validateJson<{ mnemonic: string }>(raw);
  return parsed.value?.mnemonic ?? '';
}

export async function explainWrongOptions(question: Question) {
  const { chunks, summary } = await buildRelevantContext(question.text, 4);

  const context: AIContextPayload = {
    summary,
    query: question.text,
    chunks,
    level: question.difficulty,
  };

  const raw = await groqRequest({
    task: 'explanation',
    messages: [
      { role: 'system', content: buildWrongOptionsPrompt(question, context) },
      { role: 'user', content: 'Analizează opțiunile și returnează JSON, integral în română.' },
    ],
    skipLibraryContext: true,
  });

  const parsed = validateJson<ExplainWrongOptionsResult>(raw);
  return parsed.value?.options ?? [];
}

export function getAdaptiveDifficulty({ accuracy, streak, time }: AdaptiveDifficultyInput): 'easy' | 'medium' | 'hard' {
  let score = 0;
  if (accuracy >= 80) score += 2;
  else if (accuracy < 50) score -= 2;
  if (streak >= 7) score += 2;
  else if (streak >= 3) score += 1;
  if (typeof time === 'number' && time < 20) score -= 1;
  if (score >= 2) return 'hard';
  if (score <= -1) return 'easy';
  return 'medium';
}

function deepCleanText(text: string): string {
  if (!text) return '';
  // eslint-disable-next-line no-control-regex
  const controlCharsRe = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F-\\x9F]', 'g');
  return text
    .replace(controlCharsRe, '')
    .replace(/\s+/g, ' ')
    .trim();
}

logAIDebug('AIEngine:init', 'inițializat');

/**
 * Promptul de chat e compus în `promptKit.ts` (bază + modul per mod + modul carte + blocuri
 * dinamice); aici doar se mapează opțiunile motorului pe intrarea compunătorului.
 */
export function buildChatSystemPrompt(contextSummary: string, options: ChatResponseOptions, userMessage?: string) {
  return composeChatSystemPrompt({
    mode: options.mode ?? 'grounded',
    contextSummary,
    hasContext: options.hasContext,
    scopedSourceName: options.scopedSourceName,
    bookMode: options.bookMode,
    studyContext: options.studyContext,
    focusTopics: options.focusTopics,
    conversationSummary: options.conversationSummary,
    personalMemory: options.personalMemory,
    tone: options.tone,
    tutorContext: options.tutorContext,
    recentDiagram: options.recentDiagram,
    userMessage,
    appQuestion: userMessage ? isAppQuestion(userMessage) : false,
  });
}

export async function generateChatResponse(
  message: string,
  contextSummary: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  options: ChatResponseOptions = {},
): Promise<string> {
  const systemPrompt = buildChatSystemPrompt(contextSummary, options, message);
  const recentHistory = fitHistoryToBudget(compactOldAssistantTurns(history));

  return groqRequest({
    task: 'chat',
    temperature: CHAT_MODE_TEMPERATURE[options.mode ?? 'grounded'],
    messages: [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message },
    ],
    skipLibraryContext: true,
  });
}

export async function generateChatResponseStream(
  message: string,
  contextSummary: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  onChunk: (text: string) => void,
  options: ChatResponseOptions = {},
  abortSignal?: AbortSignal,
): Promise<string> {
  const systemPrompt = buildChatSystemPrompt(contextSummary, options, message);
  const recentHistory = fitHistoryToBudget(compactOldAssistantTurns(history));

  const outgoing = [
    { role: 'system' as const, content: systemPrompt },
    ...recentHistory,
    { role: 'user' as const, content: message },
  ];
  logPromptBreakdown('chat', outgoing);
  return groqStream(
    outgoing,
    onChunk,
    CHAT_MODE_TEMPERATURE[options.mode ?? 'grounded'],
    abortSignal,
    true, // context already injected via systemPrompt — skip internal library search
    {
      ...(options.onServed ? { onServed: options.onServed } : {}),
      ...(options.onFinish ? { onFinish: options.onFinish } : {}),
    },
  );
}

/**
 * Compress an older slice of the conversation into a short memory note, so long
 * threads keep continuity without sending every message back to the model.
 * Returns '' if there is too little to summarize or on failure (non-blocking).
 */
export async function summarizeConversation(
  history: { role: 'user' | 'assistant'; content: string }[],
  previousSummary = '',
): Promise<string> {
  const transcript = history
    .filter((turn) => turn.content.trim())
    .map((turn) => `${turn.role === 'user' ? 'Student' : 'Asistent'}: ${deepCleanText(turn.content).slice(0, 600)}`)
    .join('\n');
  if (transcript.length < 200) return previousSummary;

  try {
    return await groqRequest({
      task: 'analysis',
      messages: [
        {
          role: 'system',
          content: [
            'Comprimi o conversație de studiu medical într-o notă de memorie scurtă (max 8 bullets).',
            'Reține: subiectele discutate, ce a înțeles greu studentul, concepte cheie atinse, întrebări deschise.',
            'Răspunde în română, doar bullets concise, fără introducere.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            previousSummary ? `Rezumat anterior:\n${previousSummary}\n` : '',
            `Conversație de comprimat:\n${transcript}`,
          ].filter(Boolean).join('\n'),
        },
      ],
      temperature: 0.2,
      maxTokens: 500,
      skipLibraryContext: true,
      light: true,
    });
  } catch {
    return previousSummary;
  }
}

export function getUserProfile(profileId: string) {
  return loadUserProfile(profileId);
}

