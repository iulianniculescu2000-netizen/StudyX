/**
 * Zod schemas for everything the app asks a model to return as JSON.
 *
 * Models are unreliable about structure: a field goes missing, a number arrives
 * as a string, the correct answer is "B" instead of `isCorrect: true`, one
 * question in a batch of ten has no options. These schemas are deliberately
 * TOLERANT in the way that matters:
 *
 *  - absent/ill-typed OPTIONAL fields fall back to a safe default;
 *  - common shapes are coerced (string → number, "A"/index → isCorrect, a bare
 *    array instead of `{questions:[…]}`);
 *  - in a list, an invalid element is DROPPED on its own — the rest of the batch
 *    survives — and the batch only fails when nothing usable is left;
 *  - failures carry a readable message (`path: reason`) for logs and for the
 *    repair prompt in `requestStructured`.
 *
 * Every list schema outputs `{ <items>, dropped }` so callers can log or surface
 * how many elements were discarded.
 */
import { z } from 'zod';
import { MEMORY_KINDS, type MemoryKind } from '../../ai/chatMemory';
import { ALL_QUESTION_TYPES, type QuestionType } from './questionTypes';
import type { AgentActionType, AgentStep } from './agent';
import { looksLikeJson, parseJsonLoose } from '../jsonExtract';

// ── Error formatting ─────────────────────────────────────────────────────────

/** `path: reason` lines, capped, for logging and for the repair prompt. */
export function formatZodError(error: z.ZodError, max = 6): string {
  const lines = error.issues.slice(0, max).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(rădăcină)';
    return `${path}: ${issue.message}`;
  });
  const extra = error.issues.length - lines.length;
  return extra > 0 ? `${lines.join('; ')}; încă ${extra} probleme` : lines.join('; ');
}

// ── Parse + validate a raw reply ─────────────────────────────────────────────

export type Attempt<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Tolerant parse (fences, `<think>`, chatter, trailing commas, truncation) followed by
 * schema validation. No network: usable wherever a raw reply is already in hand.
 */
export function parseStructuredReply<T>(raw: unknown, schema: z.ZodType<T>): Attempt<T> {
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) return { ok: false, error: 'răspuns gol' };
  const loose = parseJsonLoose(text);
  if (!loose) {
    return { ok: false, error: looksLikeJson(text) ? 'JSON invalid sau neînchis, imposibil de citit' : 'răspunsul nu conține JSON' };
  }
  const result = schema.safeParse(loose.value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: formatZodError(result.error) };
}

// ── Coercion helpers ─────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** First present key, so `front`/`question`/`q` style aliases resolve in one place. */
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function toText(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'da', 'yes', 'adevarat', 'adevărat', '1', 'corect'].includes(s)) return true;
    if (['false', 'nu', 'no', 'fals', '0', 'gresit', 'greșit'].includes(s)) return false;
  }
  return undefined;
}

function toStringList(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const out = v.map(toText).filter((s): s is string => Boolean(s));
    return out;
  }
  if (typeof v === 'string' && v.trim()) return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return undefined;
}

/** A required, non-empty string (numbers/booleans are stringified first). */
const reqText = (min = 1) => z.preprocess(toText, z.string({ error: 'lipsește sau nu e text' }).min(min, { error: 'prea scurt' }));
/** An optional string that falls back to `undefined` instead of failing. */
const optText = z.preprocess((v) => toText(v) || undefined, z.string().optional()).catch(undefined);
const textOr = (fallback: string) => z.preprocess((v) => toText(v) ?? fallback, z.string()).catch(fallback);

// ── List unwrapping ──────────────────────────────────────────────────────────

/**
 * The array of items inside whatever shape the model chose: the array itself,
 * `{<key>:[…]}` for any expected key, the only array-valued property, or — when
 * `single` accepts it — a lone item object.
 */
function unwrapList(input: unknown, keys: string[], single?: (o: Record<string, unknown>) => boolean): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return null;
  for (const key of keys) {
    if (Array.isArray(input[key])) return input[key] as unknown[];
  }
  const arrays = Object.values(input).filter(Array.isArray);
  if (arrays.length === 1) return arrays[0] as unknown[];
  if (single?.(input)) return [input];
  // `{"items": null}` / `{}`: an explicit empty answer, not malformed.
  if (keys.some((key) => key in input)) return [];
  if (Object.keys(input).length === 0) return [];
  return null;
}

interface LenientListOptions {
  keys: string[];
  /** Fewest valid items for the batch to count as valid. 0 allows an empty list. */
  min: number;
  single?: (o: Record<string, unknown>) => boolean;
}

/** Validates each element on its own; invalid ones are dropped and counted. */
function lenientItems<T>(
  item: z.ZodType<T>,
  input: unknown,
  opts: LenientListOptions,
  ctx: z.core.$RefinementCtx<unknown>,
): { items: T[]; dropped: number } | typeof z.NEVER {
  const list = unwrapList(input, opts.keys, opts.single);
  if (!list) {
    ctx.issues.push({ code: 'custom', message: `se aștepta o listă (${opts.keys.join('/')}), dar a venit ${Array.isArray(input) ? 'altceva' : typeof input}`, input });
    return z.NEVER;
  }
  const items: T[] = [];
  const problems: string[] = [];
  list.forEach((entry, index) => {
    const parsed = item.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
    else problems.push(`[${index}] ${formatZodError(parsed.error, 2)}`);
  });
  if (items.length < opts.min) {
    const detail = problems.length > 0 ? `: ${problems.slice(0, 3).join(' | ')}` : '';
    ctx.issues.push({
      code: 'custom',
      message: list.length === 0 ? 'lista e goală' : `niciun element valid din ${list.length}${detail}`,
      input,
    });
    return z.NEVER;
  }
  return { items, dropped: problems.length };
}

// ── Generated questions ──────────────────────────────────────────────────────

export interface GeneratedQuestionItem {
  text: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  explanation: string;
  tags?: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  sources?: string[];
  reference?: string;
  type?: QuestionType;
}

const DIFFICULTY_ALIASES: Record<string, 'easy' | 'medium' | 'hard'> = {
  easy: 'easy', usor: 'easy', 'ușor': 'easy', simplu: 'easy',
  medium: 'medium', mediu: 'medium', moderat: 'medium', intermediar: 'medium',
  hard: 'hard', dificil: 'hard', greu: 'hard', expert: 'hard',
};

function normalizeDifficulty(v: unknown): 'easy' | 'medium' | 'hard' | undefined {
  const s = toText(v)?.toLowerCase();
  return s ? DIFFICULTY_ALIASES[s] : undefined;
}

function normalizeQuestionType(v: unknown): QuestionType | undefined {
  const s = toText(v)?.toLowerCase().replace(/[\s-]+/g, '_');
  return s && (ALL_QUESTION_TYPES as string[]).includes(s) ? (s as QuestionType) : undefined;
}

/** Indexes named by a "correct answer" field: "B", "b)", "A, C", "AC", 2, [0, 2]. */
function correctIndexes(v: unknown, zeroBased: boolean): number[] {
  if (Array.isArray(v)) return v.flatMap((entry) => correctIndexes(entry, zeroBased));
  if (typeof v === 'number' && Number.isInteger(v)) return [zeroBased ? v : v - 1];
  if (typeof v !== 'string') return [];
  const s = v.trim();
  if (/^\d+$/.test(s)) return [zeroBased ? Number(s) : Number(s) - 1];
  const match = /^[\s(]*([a-hA-H](?:[\s,;&/+]*(?:și|si|and)?[\s,;&/+]*[a-hA-H])*)[\s).:]*$/.exec(s);
  if (!match) return [];
  return [...match[1].toLowerCase().matchAll(/[a-h]/g)].map((m) => m[0].charCodeAt(0) - 97);
}

function normalizeOptions(raw: unknown): Array<{ text: string; isCorrect: boolean | undefined }> {
  let entries: unknown[] = [];
  if (Array.isArray(raw)) entries = raw;
  else if (isRecord(raw)) entries = Object.values(raw); // {"A":"…","B":"…"}
  return entries
    .map((entry) => {
      if (typeof entry === 'string' || typeof entry === 'number') {
        // "A) text" / "B. text": the letter is layout, not content.
        return { text: String(entry).replace(/^\s*\(?[A-Ha-h][).:]\s+/, '').trim(), isCorrect: undefined };
      }
      if (isRecord(entry)) {
        return {
          text: toText(pick(entry, ['text', 'label', 'option', 'value', 'content', 'answer'])) ?? '',
          isCorrect: toBool(pick(entry, ['isCorrect', 'is_correct', 'correct'])),
        };
      }
      return { text: '', isCorrect: undefined };
    })
    .filter((option) => option.text.length > 0);
}

/** Maps aliases and derives `isCorrect` from a question-level "correct answer" field when options carry none. */
function prepareQuestion(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const options = normalizeOptions(pick(input, ['options', 'answers', 'choices', 'variante']));

  if (!options.some((o) => o.isCorrect === true)) {
    const indexKey = pick(input, ['correctIndex', 'correct_index', 'correctIndices', 'correctIndexes']);
    const letterKey = pick(input, ['correctAnswer', 'correct_answer', 'correct', 'correctAnswers', 'correctOptions', 'correct_options', 'answer', 'raspuns', 'răspuns']);
    const wanted = indexKey !== undefined
      ? correctIndexes(indexKey, true)
      : letterKey !== undefined ? correctIndexes(letterKey, false) : [];
    // A correct answer given as the option's own text ("correctAnswer": "Fibrilație atrială").
    const byText = typeof letterKey === 'string'
      ? options.findIndex((o) => o.text.toLowerCase() === letterKey.trim().toLowerCase())
      : -1;
    if (byText >= 0 && wanted.length === 0) wanted.push(byText);
    options.forEach((option, index) => { option.isCorrect = wanted.includes(index); });
  }

  return {
    text: pick(input, ['text', 'question', 'stem', 'intrebare', 'întrebare']),
    options: options.map((o) => ({ text: o.text, isCorrect: o.isCorrect === true })),
    explanation: pick(input, ['explanation', 'explicatie', 'explicație', 'rationale']),
    tags: pick(input, ['tags', 'keywords']),
    difficulty: pick(input, ['difficulty', 'dificultate']),
    sources: pick(input, ['sources', 'surse']),
    reference: pick(input, ['reference', 'referinta', 'referință']),
    type: pick(input, ['type', 'questionType', 'question_type']),
  };
}

export const QuestionItemSchema: z.ZodType<GeneratedQuestionItem> = z.preprocess(
  prepareQuestion,
  z.object({
    text: reqText(3),
    options: z
      .array(z.object({ text: z.string().min(1), isCorrect: z.boolean() }), { error: 'lipsesc variantele' })
      .min(2, { error: 'sunt necesare cel puțin 2 variante' })
      .refine((options) => options.some((o) => o.isCorrect), { error: 'nicio variantă marcată corect' }),
    explanation: textOr(''),
    tags: z.preprocess(toStringList, z.array(z.string()).optional()).catch(undefined),
    difficulty: z.preprocess(normalizeDifficulty, z.enum(['easy', 'medium', 'hard']).optional()).catch(undefined),
    sources: z.preprocess(toStringList, z.array(z.string()).optional()).catch(undefined),
    reference: optText,
    type: z.preprocess(normalizeQuestionType, z.enum(ALL_QUESTION_TYPES as [QuestionType, ...QuestionType[]]).optional()).catch(undefined),
  }),
) as unknown as z.ZodType<GeneratedQuestionItem>;

export interface GeneratedQuestionsBatch {
  questions: GeneratedQuestionItem[];
  /** How many elements of the reply were discarded as unusable. */
  dropped: number;
}

/** `{questions:[…]}`, a bare array, or one question object — at least one valid question. */
export const QuestionsBatchSchema: z.ZodType<GeneratedQuestionsBatch> = z.unknown().transform((input, ctx) => {
  const result = lenientItems(QuestionItemSchema, input, {
    keys: ['questions', 'intrebari', 'întrebări', 'items', 'data'],
    min: 1,
    single: (o) => 'options' in o && ('text' in o || 'question' in o),
  }, ctx);
  return result === z.NEVER ? z.NEVER : { questions: result.items, dropped: result.dropped };
});

// ── Flashcards ───────────────────────────────────────────────────────────────

export interface FlashcardItem { front: string; back: string }
export interface FlashcardsBatch { cards: FlashcardItem[]; dropped: number }

export const FlashcardItemSchema: z.ZodType<FlashcardItem> = z.preprocess(
  (input) => (isRecord(input)
    ? {
        front: pick(input, ['front', 'question', 'q', 'term', 'intrebare', 'întrebare']),
        back: pick(input, ['back', 'answer', 'a', 'definition', 'raspuns', 'răspuns']),
      }
    : input),
  z.object({ front: reqText(1), back: reqText(1) }),
) as unknown as z.ZodType<FlashcardItem>;

/** `{cards:[{front,back}]}` — also accepts a bare array or `flashcards`/`items`. `min` 0 keeps an honest empty answer valid. */
export function flashcardsBatchSchema(min = 1): z.ZodType<FlashcardsBatch> {
  return z.unknown().transform((input, ctx) => {
    const result = lenientItems(FlashcardItemSchema, input, {
      keys: ['cards', 'flashcards', 'carduri', 'items', 'data'],
      min,
      single: (o) => ('front' in o || 'question' in o) && ('back' in o || 'answer' in o),
    }, ctx);
    return result === z.NEVER ? z.NEVER : { cards: result.items, dropped: result.dropped };
  });
}
export const FlashcardsBatchSchema = flashcardsBatchSchema(1);

// ── Chat memory ──────────────────────────────────────────────────────────────

export interface MemoryItemDraft { kind: MemoryKind; text: string }
export interface MemoryExtraction { items: MemoryItemDraft[]; dropped: number }

const MemoryItemSchema: z.ZodType<MemoryItemDraft> = z.preprocess(
  (input) => (isRecord(input)
    ? { kind: toText(pick(input, ['kind', 'type', 'tip']))?.toLowerCase(), text: pick(input, ['text', 'fact', 'content', 'memory']) }
    : input),
  z.object({
    kind: z.enum(MEMORY_KINDS as [MemoryKind, ...MemoryKind[]], { error: 'tip de memorie necunoscut' }),
    text: reqText(1),
  }),
) as unknown as z.ZodType<MemoryItemDraft>;

/** `{items:[{kind,text}]}`. An empty list is a legitimate answer ("nothing durable"). */
export const MemoryExtractionSchema: z.ZodType<MemoryExtraction> = z.unknown().transform((input, ctx) => {
  const result = lenientItems(MemoryItemSchema, input, { keys: ['items', 'memories', 'memorie'], min: 0 }, ctx);
  return result === z.NEVER ? z.NEVER : { items: result.items, dropped: result.dropped };
});

// ── Clinical verification ────────────────────────────────────────────────────

export interface VerificationIssueDraft { claim: string; reason: string }
export interface VerificationResult { issues: VerificationIssueDraft[]; dropped: number }

const VerificationIssueSchema: z.ZodType<VerificationIssueDraft> = z.preprocess(
  (input) => (isRecord(input)
    ? { claim: pick(input, ['claim', 'afirmatie', 'afirmație']), reason: pick(input, ['reason', 'motiv', 'explanation']) }
    : input),
  z.object({ claim: reqText(1), reason: reqText(1) }),
) as unknown as z.ZodType<VerificationIssueDraft>;

export const VerificationResultSchema: z.ZodType<VerificationResult> = z.unknown().transform((input, ctx) => {
  const result = lenientItems(VerificationIssueSchema, input, { keys: ['issues', 'probleme'], min: 0 }, ctx);
  return result === z.NEVER ? z.NEVER : { issues: result.items, dropped: result.dropped };
});

// ── "What I don't know" analysis (analyzeAnswer) ─────────────────────────────

export interface AnalysisResultDraft {
  explanation: string;
  mistakeType: string;
  rule: string;
  confidence?: number;
  missingConcept?: string;
  recommendedTopic?: string;
  relatedConcepts: string[];
  sources: string[];
}

/** Diagnosis of a wrong answer. Only `explanation` is indispensable; everything else has a safe default. */
export const AnalysisResultSchema: z.ZodType<AnalysisResultDraft> = z.preprocess(
  (input) => (isRecord(input)
    ? {
        explanation: pick(input, ['explanation', 'explicatie', 'explicație']),
        mistakeType: pick(input, ['mistakeType', 'mistake_type', 'errorType']),
        rule: pick(input, ['rule', 'regula', 'regulă']),
        confidence: pick(input, ['confidence', 'incredere', 'încredere']),
        missingConcept: pick(input, ['missingConcept', 'missing_concept', 'gap']),
        recommendedTopic: pick(input, ['recommendedTopic', 'recommended_topic']),
        relatedConcepts: pick(input, ['relatedConcepts', 'related_concepts']),
        sources: pick(input, ['sources', 'surse']),
      }
    : input),
  z.object({
    explanation: reqText(1),
    mistakeType: textOr(''),
    rule: textOr(''),
    confidence: z.preprocess((v) => {
      const n = toNumber(v);
      // "85" meaning 85% is read as 0.85.
      return n !== undefined && n > 1 && n <= 100 ? n / 100 : n;
    }, z.number().optional()).catch(undefined),
    missingConcept: optText,
    recommendedTopic: optText,
    relatedConcepts: z.preprocess(toStringList, z.array(z.string())).catch([]),
    sources: z.preprocess(toStringList, z.array(z.string())).catch([]),
  }),
) as unknown as z.ZodType<AnalysisResultDraft>;

// ── Answer-dispute verdict (proposeAnswerCorrection) ─────────────────────────

export interface AnswerVerdictDraft { agrees: boolean; correctLetters: string[]; reasoning: string }

export const AnswerVerdictSchema: z.ZodType<AnswerVerdictDraft> = z.preprocess(
  (input) => (isRecord(input)
    ? {
        agrees: pick(input, ['agrees', 'agree']),
        correctLetters: pick(input, ['correctLetters', 'correct_letters', 'letters']),
        reasoning: pick(input, ['reasoning', 'motiv', 'reason']),
      }
    : input),
  z.object({
    agrees: z.preprocess(toBool, z.boolean({ error: 'agrees trebuie să fie true/false' })),
    correctLetters: z.preprocess(
      (v) => (typeof v === 'string' ? v.split(/[^a-hA-H]+/).filter(Boolean) : toStringList(v)),
      z.array(z.string()),
    ).catch([]),
    reasoning: textOr(''),
  }),
) as unknown as z.ZodType<AnswerVerdictDraft>;

// ── Agent plan ───────────────────────────────────────────────────────────────

/** Actions the planner may emit (`correct_answer` is built by code, never planned by the model). */
export const PLANNER_ACTIONS: readonly AgentActionType[] = [
  'create_folder', 'create_library_folder', 'generate_quiz_pack', 'generate_quiz_topic', 'generate_from_mistakes',
  'create_flashcards', 'create_flashcards_topic', 'summarize_document', 'create_study_plan',
  'move_quiz', 'rename_quiz', 'delete_quiz', 'rename_folder', 'delete_folder',
];

const positive = (v: unknown): number | undefined => {
  const n = toNumber(v);
  return n !== undefined && n > 0 ? Math.round(n) : undefined;
};

function prepareStep(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => {
    const s = toText(v)?.toLowerCase();
    return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
  };
  const str = (...keys: string[]) => {
    const t = toText(pick(input, keys));
    return t ? t : undefined;
  };
  return {
    action: toText(pick(input, ['action', 'type']))?.toLowerCase(),
    name: str('name'),
    newName: str('newName', 'new_name'),
    parent: str('parent'),
    source: str('source'),
    topic: str('topic'),
    folder: str('folder'),
    quiz: str('quiz'),
    packCount: positive(pick(input, ['packCount', 'packcount', 'packs'])),
    questionsPerPack: positive(pick(input, ['questionsPerPack', 'questions', 'questionsperpack'])),
    count: positive(pick(input, ['count', 'cards', 'cardCount'])),
    questionType: oneOf(pick(input, ['questionType', 'question_type']), ['single', 'multiple']),
    examStyle: oneOf(pick(input, ['examStyle', 'exam_style']), ['residency', 'simple']),
    difficulty: oneOf(pick(input, ['difficulty']), ['auto', 'easy', 'medium', 'hard']),
    examName: str('examName', 'exam'),
    studyDays: positive(pick(input, ['studyDays', 'days'])),
    hoursPerDay: positive(pick(input, ['hoursPerDay', 'hours'])),
  };
}

export const AgentStepSchema: z.ZodType<AgentStep> = z.preprocess(
  prepareStep,
  z.object({
    action: z.enum(PLANNER_ACTIONS as [AgentActionType, ...AgentActionType[]], { error: 'acțiune necunoscută' }),
    name: z.string().optional(),
    newName: z.string().optional(),
    parent: z.string().optional(),
    source: z.string().optional(),
    topic: z.string().optional(),
    folder: z.string().optional(),
    quiz: z.string().optional(),
    packCount: z.number().optional(),
    questionsPerPack: z.number().optional(),
    count: z.number().optional(),
    questionType: z.enum(['single', 'multiple']).optional(),
    examStyle: z.enum(['residency', 'simple']).optional(),
    difficulty: z.enum(['auto', 'easy', 'medium', 'hard']).optional(),
    examName: z.string().optional(),
    studyDays: z.number().optional(),
    hoursPerDay: z.number().optional(),
  }),
) as unknown as z.ZodType<AgentStep>;

export interface AgentPlanDraft {
  isCommand: boolean;
  needsClarification: boolean;
  reply: string;
  steps: AgentStep[];
  /** Steps the planner wrote that were discarded (unknown action, wrong shape). */
  droppedSteps: number;
}

/**
 * The planner's reply. Lenient by design: a plain "not a command" answer needs
 * no steps, a bare array is read as the step list, and each step is validated on
 * its own so one bad step does not cancel the others.
 */
export const AgentPlanSchema: z.ZodType<AgentPlanDraft> = z.unknown().transform((input, ctx) => {
  if (Array.isArray(input)) input = { isCommand: true, steps: input };
  if (!isRecord(input)) {
    ctx.issues.push({ code: 'custom', message: 'planul trebuie să fie un obiect JSON', input });
    return z.NEVER;
  }
  const rawSteps = unwrapList(pick(input, ['steps', 'pasi', 'pași', 'actions']) ?? [], ['steps']) ?? [];
  const steps: AgentStep[] = [];
  const problems: string[] = [];
  rawSteps.forEach((entry, index) => {
    const parsed = AgentStepSchema.safeParse(entry);
    if (parsed.success) steps.push(parsed.data);
    else problems.push(`steps.${index}: ${formatZodError(parsed.error, 2)}`);
  });
  const looksLikePlan = ['isCommand', 'is_command', 'steps', 'reply', 'needsClarification', 'actions'].some((key) => key in input);
  if (!looksLikePlan) {
    ctx.issues.push({ code: 'custom', message: 'lipsesc câmpurile planului (isCommand, reply, steps)', input });
    return z.NEVER;
  }
  if (rawSteps.length > 0 && steps.length === 0 && toBool(input.isCommand) === true) {
    // Declared a command but every step is unusable — worth a repair attempt.
    ctx.issues.push({ code: 'custom', message: `niciun pas valid: ${problems.slice(0, 3).join(' | ')}`, input });
    return z.NEVER;
  }
  return {
    isCommand: (toBool(pick(input, ['isCommand', 'is_command'])) ?? steps.length > 0) && steps.length > 0,
    needsClarification: toBool(pick(input, ['needsClarification', 'needs_clarification'])) ?? false,
    reply: toText(input.reply) ?? '',
    steps,
    droppedSteps: problems.length,
  };
});
