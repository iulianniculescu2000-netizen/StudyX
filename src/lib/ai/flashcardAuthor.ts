/**
 * flashcardAuthor.ts
 *
 * Agentul dedicat de flashcarduri: un singur punct de intrare pentru „fă-mi N carduri despre X, la nivelul Y”.
 * Ancorează cardurile în textul cărții când îl are (capitol din tematică, document din bibliotecă, sau fragmentele
 * cele mai potrivite subiectului), le cere în loturi mici ca să rămână precise, elimină duplicatele și întoarce un
 * pachet gata de salvat. Scripturile promptului stau în `src/ai/flashcardPrompts.ts`.
 */
import { z } from 'zod';
import {
  COVERAGE_FACETS,
  FLASHCARD_DIFFICULTY_LABEL,
  buildFlashcardAuthorSystem,
  buildFlashcardUserPrompt,
  type FlashcardDifficulty,
  type FlashcardLevel,
} from '../../ai/flashcardPrompts';
import { retrieveRelevantChunks } from '../../ai/retriever';
import { getVaultChunksBySource } from '../../ai/vectorStore';
import { useAIStore } from '../../store/aiStore';
import { useQuizStore } from '../../store/quizStore';
import type { Quiz, Question } from '../../types';
import { BOOK_NAMES, type CurriculumChapter } from '../curriculum';
import { cleanFlashcardText } from '../flashcardText';
import { isDuplicateFlashcard } from '../groq';
import { getChapterFullText } from './bookChapterText';
import { buildChapterContext } from './chapterContext';
import { WHOLE_DOCUMENT_HEADING } from './chapterQuizGeneration';
import { retrievalFiltersForScope, type SourceScope } from './sourceScope';
import { requestStructured } from './structured';

export const MIN_FLASHCARDS = 1;
export const MAX_FLASHCARDS = 100;
/** Cărți pe o cerere către model: sub ~10 rămân precise și JSON-ul nu se taie. */
const BATCH_SIZE = 10;
const WINDOW_CHARS = 3200;
const CARDS_PER_WINDOW = 6;
const MAX_WINDOWS = 14;
const CONCURRENCY = 2;
const FRONT_MAX = 240;
const BACK_MAX = 520;

export type FlashcardScopeRequest =
  /** Subiect liber (ex. „acidoza metabolică”); dacă i se dă capitolul din tematică, cardurile se ancorează în el. */
  | { kind: 'topic'; topic: string; chapter?: CurriculumChapter | null }
  /** Un capitol din tematică (opțional restrâns la un topic). */
  | { kind: 'chapter'; chapter: CurriculumChapter; topic?: string }
  /** Un document din bibliotecă, întreg sau pe un capitol al lui. */
  | { kind: 'source'; sourceId: string; sourceName: string; heading?: string; topic?: string }
  /** Text lipit de utilizator. */
  | { kind: 'text'; text: string; topic: string };

export interface FlashcardRequest {
  scope: FlashcardScopeRequest;
  count: number;
  difficulty: FlashcardDifficulty;
  folderId: string | null;
  /** Spațiul din care vine cererea: hotărăște și ce cărți are voie să caute. */
  space: SourceScope;
  title?: string;
  /** Fronturile deja existente (în folder sau în pachetele cărții), ca să nu fie repetate. */
  avoidFronts?: readonly string[];
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface FlashcardResult {
  deck: Quiz;
  /** Adevărat când cardurile au pornit din text din carte, fals când vin din cunoștințele modelului. */
  grounded: boolean;
  requested: number;
  produced: number;
  warnings: string[];
}

export interface DraftCard { front: string; back: string; level: FlashcardLevel }

/* ── Funcții pure (testate separat) ──────────────────────────────────────────────────────────── */

const LEVEL_ORDER: Record<FlashcardLevel, number> = { easy: 0, medium: 1, hard: 2 };

export function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(MIN_FLASHCARDS, Math.min(MAX_FLASHCARDS, Math.round(value)));
}

export function normalizeLevel(raw: unknown): FlashcardLevel | null {
  const text = String(raw ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (['easy', 'usor', 'simplu', 'low', '1'].includes(text)) return 'easy';
  if (['medium', 'mediu', 'mid', 'intermediar', '2'].includes(text)) return 'medium';
  if (['hard', 'dificil', 'greu', 'high', '3'].includes(text)) return 'hard';
  return null;
}

/** Ferestre de text pe limite de paragraf, ca fiecare lot să primească un fragment coerent. */
export function splitIntoWindows(text: string, size = WINDOW_CHARS): string[] {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const windows: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > size) {
      windows.push(current);
      current = '';
    }
    // Un paragraf mai lung decât fereastra se taie la propoziție, nu la jumătate de cuvânt.
    if (paragraph.length > size) {
      const sentences = paragraph.split(/(?<=[.!?;])\s+/);
      for (const sentence of sentences) {
        if (current && current.length + sentence.length + 1 > size) {
          windows.push(current);
          current = '';
        }
        current += (current ? ' ' : '') + sentence;
      }
    } else {
      current += (current ? '\n\n' : '') + paragraph;
    }
  }
  if (current) windows.push(current);
  return windows;
}

/** Alege `n` ferestre răspândite uniform (acoperire pe tot capitolul, nu doar începutul). */
export function pickSpread<T>(items: readonly T[], n: number): T[] {
  if (n >= items.length) return [...items];
  if (n <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < n; i += 1) out.push(items[Math.floor((i * items.length) / n)]);
  return out;
}

/** Cât de aproape e o fereastră de subiect: câte cuvinte semnificative ale subiectului conține. */
export function topicOverlap(window: string, topic: string): number {
  const words = topic.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  if (words.length === 0) return 0;
  const haystack = window.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
}

export interface BatchPlan { window: string | null; facet: string | null; n: number }

/**
 * Împarte `count` în cereri de cel mult BATCH_SIZE. Cu text: ferestre răspândite pe capitol, cu ~6 carduri pe fereastră.
 * Fără text: aspecte diferite ale subiectului (definiție, diagnostic, tratament…), ca setul să acopere lățimea.
 */
export function planBatches(count: number, windows: readonly string[], topic = ''): BatchPlan[] {
  const total = clampCount(count);
  const plans: BatchPlan[] = [];
  if (windows.length === 0) {
    const calls = Math.ceil(total / BATCH_SIZE);
    for (let i = 0; i < calls; i += 1) {
      const n = Math.min(BATCH_SIZE, total - i * BATCH_SIZE);
      plans.push({ window: null, facet: COVERAGE_FACETS[i % COVERAGE_FACETS.length], n });
    }
    return plans;
  }
  const wanted = Math.max(1, Math.min(MAX_WINDOWS, Math.ceil(total / CARDS_PER_WINDOW)));
  // La un topic precis, ferestrele care îl conțin trec înainte; altfel se răspândesc uniform.
  const relevant = topic ? windows.filter((window) => topicOverlap(window, topic) > 0) : [];
  const rest = windows.filter((window) => !relevant.includes(window));
  // Întâi ferestrele care conțin subiectul; dacă nu ajung, se completează cu altele răspândite pe capitol.
  const chosen = relevant.length >= wanted
    ? pickSpread(relevant, wanted)
    : relevant.length > 0
      ? [...relevant, ...pickSpread(rest, wanted - relevant.length)]
      : pickSpread(windows, wanted);
  const base = Math.floor(total / chosen.length);
  let extra = total - base * chosen.length;
  chosen.forEach((window) => {
    let n = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    while (n > 0) {
      const step = Math.min(BATCH_SIZE, n);
      plans.push({ window, facet: null, n: step });
      n -= step;
    }
  });
  return plans;
}

export const flashcardsReplySchema = z.unknown().transform((input, ctx): DraftCard[] => {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? ((input as Record<string, unknown>).cards ?? (input as Record<string, unknown>).flashcards ?? (input as Record<string, unknown>).carduri)
      : null;
  if (!Array.isArray(source)) {
    ctx.addIssue({ code: 'custom', message: 'Lipsește lista „cards”.' });
    return z.NEVER;
  }
  const cards: DraftCard[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const front = cleanFlashcardText(String(record.front ?? record.question ?? record.q ?? '')).trim();
    const back = cleanFlashcardText(String(record.back ?? record.answer ?? record.a ?? '')).trim();
    if (front.length < 4 || back.length < 1) continue;
    cards.push({ front, back: back.charAt(0).toUpperCase() + back.slice(1), level: normalizeLevel(record.difficulty ?? record.level) ?? 'medium' });
  }
  if (cards.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Niciun card valid în răspuns.' });
    return z.NEVER;
  }
  return cards;
});

/** Fața trebuie să se înțeleagă singură: cel puțin 3 cuvinte, fără etichetă de specialitate în față. */
export function isSelfContainedFront(front: string): boolean {
  if (/^\s*\[[^\]]+\]/.test(front)) return false;
  return front.trim().split(/\s+/).length >= 3;
}

/** Taie cardurile prea lungi (de obicei text copiat) și pe cele care repetă un front deja avut. */
export function cleanAndDedupe(cards: readonly DraftCard[], existingFronts: readonly string[]): DraftCard[] {
  const fronts = [...existingFronts];
  const backs = new Set<string>();
  const out: DraftCard[] = [];
  for (const card of cards) {
    if (card.front.length > FRONT_MAX || card.back.length > BACK_MAX) continue;
    // O față fără context („AVRT?”, „[Cardiologie] Un semn?”) nu se poate repeta singură: o aruncăm.
    if (!isSelfContainedFront(card.front)) continue;
    const backKey = card.back.toLowerCase().replace(/\s+/g, ' ');
    if (backs.has(backKey) || isDuplicateFlashcard(card.front, fronts)) continue;
    backs.add(backKey);
    fronts.push(card.front);
    out.push(card);
  }
  return out;
}

/** Ordinea de studiu: de la bază spre capcane, stabilă în interiorul fiecărui nivel. */
export function orderByLevel(cards: readonly DraftCard[]): DraftCard[] {
  return cards.map((card, index) => ({ card, index }))
    .sort((a, b) => LEVEL_ORDER[a.card.level] - LEVEL_ORDER[b.card.level] || a.index - b.index)
    .map((entry) => entry.card);
}

function toQuestion(card: DraftCard): Question {
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    text: card.front,
    multipleCorrect: false,
    difficulty: card.level,
    explanation: '',
    options: [{ id: 'a', text: card.back, isCorrect: true }],
  };
}

export interface DeckBuildInput {
  title: string;
  topic: string;
  folderId: string | null;
  cards: readonly DraftCard[];
  difficulty: FlashcardDifficulty;
  residency: boolean;
  chapter?: CurriculumChapter | null;
  sourceName?: string;
  /** Fals când cardurile nu au pornit din text de carte; se vede în tag-uri și în confirmarea din chat. */
  grounded?: boolean;
}

export function buildFlashcardDeck(input: DeckBuildInput): Quiz {
  const tags = ['flashcard', 'ai', 'ai-author', `nivel:${input.difficulty}`];
  if (input.grounded === false) tags.push('ai-knowledge');
  if (input.residency) tags.push('rezidentiat');
  if (input.chapter) tags.push(`chapter:${input.chapter.index}`, `book:${input.chapter.book}`);
  if (input.sourceName) tags.push(input.sourceName);
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    title: input.title,
    description: `Generate cu AI${input.difficulty === 'auto' ? '' : `, nivel ${FLASHCARD_DIFFICULTY_LABEL[input.difficulty].toLowerCase()}`}.`,
    emoji: '🃏',
    category: input.topic,
    kind: 'flashcard',
    folderId: input.folderId,
    color: 'blue',
    shuffleQuestions: true,
    shuffleAnswers: false,
    tags,
    questions: input.cards.map(toQuestion),
    createdAt: Date.now(),
  };
}

/* ── Ancorarea în carte ─────────────────────────────────────────────────────────────────────── */

interface Grounding {
  topic: string;
  bookLine?: string;
  windows: string[];
  chapter: CurriculumChapter | null;
  sourceName?: string;
}

function chapterBookLine(chapter: CurriculumChapter): string {
  return `${BOOK_NAMES[chapter.book]}, capitolul „${chapter.title}”`;
}

async function groundInChapter(chapter: CurriculumChapter, topic: string | undefined): Promise<Grounding> {
  const { scope } = await buildChapterContext(chapter, { topicName: topic });
  const text = scope ? await getChapterFullText(scope.sourceId, scope.heading) : '';
  return {
    topic: topic?.trim() || chapter.title,
    bookLine: chapterBookLine(chapter),
    windows: splitIntoWindows(text),
    chapter,
    sourceName: scope?.sourceName,
  };
}

async function groundInSource(scope: Extract<FlashcardScopeRequest, { kind: 'source' }>): Promise<Grounding> {
  const chunks = await getVaultChunksBySource(scope.sourceId);
  const wanted = scope.heading && scope.heading !== WHOLE_DOCUMENT_HEADING ? scope.heading : null;
  const selected = wanted ? chunks.filter((chunk) => (chunk.heading?.trim() || WHOLE_DOCUMENT_HEADING) === wanted) : chunks;
  return {
    topic: scope.topic?.trim() || (wanted ?? scope.sourceName.replace(/\.pdf$/i, '')),
    bookLine: wanted ? `${scope.sourceName.replace(/\.pdf$/i, '')}, ${wanted}` : scope.sourceName.replace(/\.pdf$/i, ''),
    windows: splitIntoWindows(selected.map((chunk) => chunk.text).join('\n\n')),
    chapter: null,
    sourceName: scope.sourceName,
  };
}

/** Subiect liber: caută în biblioteca spațiului din care vine cererea (Rezidențiat sau general), nu în amândouă. */
async function groundByRetrieval(topic: string, space: SourceScope): Promise<Grounding> {
  const { knowledgeSources, libraryFolders } = useAIStore.getState();
  const filters = retrievalFiltersForScope(knowledgeSources, libraryFolders, space);
  if (filters === null) return { topic, windows: [], chapter: null };
  try {
    const hits = await retrieveRelevantChunks(topic, null, 8, filters);
    if (hits.length < 2) return { topic, windows: [], chapter: null };
    return { topic, windows: splitIntoWindows(hits.map((hit) => hit.text).join('\n\n')), chapter: null, sourceName: hits[0].source };
  } catch {
    return { topic, windows: [], chapter: null };
  }
}

async function resolveGrounding(scope: FlashcardScopeRequest, space: SourceScope): Promise<Grounding> {
  switch (scope.kind) {
    case 'chapter': return groundInChapter(scope.chapter, scope.topic);
    case 'source': return groundInSource(scope);
    case 'text': return { topic: scope.topic, windows: splitIntoWindows(scope.text), chapter: null };
    case 'topic':
      return scope.chapter ? groundInChapter(scope.chapter, scope.topic) : groundByRetrieval(scope.topic, space);
  }
}

/* ── Generarea ──────────────────────────────────────────────────────────────────────────────── */

async function runPool<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
}

async function requestBatch(
  plan: BatchPlan,
  grounding: Grounding,
  difficulty: FlashcardDifficulty,
  avoid: readonly string[],
  signal?: AbortSignal,
): Promise<DraftCard[]> {
  const result = await requestStructured({
    schema: flashcardsReplySchema,
    messages: [
      { role: 'system', content: buildFlashcardAuthorSystem() },
      {
        role: 'user',
        content: buildFlashcardUserPrompt({
          topic: grounding.topic,
          bookLine: grounding.bookLine,
          difficulty,
          count: plan.n,
          context: plan.window ?? undefined,
          facet: plan.facet ?? undefined,
          avoidFronts: avoid,
        }),
      },
    ],
    // Local (doar fără cheie cloud): sarcină permisă pe local, fără mod JSON, lot mic, buget mic.
    task: 'questions',
    temperature: plan.window ? 0.3 : 0.45,
    maxTokens: Math.min(3600, 500 + plan.n * 230),
    abortSignal: signal,
    label: 'flashcardAuthor',
    schemaHint: '{"cards":[{"front":string,"back":string,"difficulty":"easy|medium|hard"}]}',
  });
  if (result.ok) return result.data;
  return [];
}

/** Cere cardurile, le curăță și întoarce un pachet nesalvat. Aruncă doar când nu iese niciun card. */
export async function generateFlashcardDeck(request: FlashcardRequest): Promise<FlashcardResult> {
  const requested = clampCount(request.count);
  const grounding = await resolveGrounding(request.scope, request.space);
  const warnings: string[] = [];
  const grounded = grounding.windows.length > 0;
  if (!grounded) warnings.push('Nu am găsit text din carte pentru acest subiect, așa că cardurile vin din cunoștințe medicale generale. Merită verificate.');

  const existing = [...(request.avoidFronts ?? []), ...(grounding.chapter ? frontsForChapter(grounding.chapter) : [])];
  let collected: DraftCard[] = [];
  const plans = planBatches(requested, grounding.windows, grounding.topic);
  let done = 0;
  request.onProgress?.(0, plans.length);

  await runPool(plans, CONCURRENCY, async (plan) => {
    if (request.signal?.aborted) return;
    try {
      const batch = await requestBatch(plan, grounding, request.difficulty, [...existing, ...collected.map((card) => card.front)], request.signal);
      collected = cleanAndDedupe([...collected, ...batch], existing);
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      warnings.push('Un lot de carduri nu a putut fi generat și a fost sărit.');
    } finally {
      done += 1;
      request.onProgress?.(done, plans.length);
    }
  });
  if (request.signal?.aborted) throw new DOMException('Generarea a fost oprită.', 'AbortError');

  // O singură rundă de completare când lipsesc carduri (duplicate scoase sau un lot gol).
  for (let round = 0; round < 1; round += 1) {
    const missing = requested - collected.length;
    if (missing <= 0 || collected.length === 0 || request.signal?.aborted) break;
    const topUp: BatchPlan = {
      window: grounding.windows.length > 0 ? grounding.windows[(grounding.windows.length >> 1) + round < grounding.windows.length ? (grounding.windows.length >> 1) + round : 0] : null,
      facet: grounding.windows.length > 0 ? null : COVERAGE_FACETS[(collected.length + round) % COVERAGE_FACETS.length],
      n: Math.min(BATCH_SIZE, missing),
    };
    const before = collected.length;
    try {
      const batch = await requestBatch(topUp, grounding, request.difficulty, [...existing, ...collected.map((card) => card.front)], request.signal);
      collected = cleanAndDedupe([...collected, ...batch], existing);
    } catch {
      // completarea e un bonus: rămâne ce avem
      break;
    }
    if (collected.length === before) break;
  }

  if (collected.length === 0) throw new Error('Nu am reușit să generez carduri pentru acest subiect. Încearcă un subiect mai precis sau verifică cheia AI.');
  if (collected.length < requested) warnings.push(`Am obținut ${collected.length} din ${requested} carduri; restul ar fi repetat sau nu erau susținute de text.`);

  const cards = (request.difficulty === 'auto' ? orderByLevel(collected) : collected.map((card) => ({ ...card, level: request.difficulty as FlashcardLevel }))).slice(0, requested);
  const residency = request.space === 'rezidentiat';
  const levelSuffix = request.difficulty === 'auto' ? '' : ` · ${FLASHCARD_DIFFICULTY_LABEL[request.difficulty]}`;
  const deck = buildFlashcardDeck({
    title: request.title?.trim() || `${grounding.topic}${levelSuffix}`,
    topic: grounding.topic,
    folderId: request.folderId,
    cards,
    difficulty: request.difficulty,
    residency,
    chapter: grounding.chapter,
    sourceName: grounding.sourceName,
    grounded,
  });
  return { deck, grounded, requested, produced: cards.length, warnings };
}

/** Fronturile pachetelor deja făcute pentru un capitol din tematică (setul Kumar și cele generate), ca să nu fie repetate. */
export function frontsForChapter(chapter: CurriculumChapter): string[] {
  const tag = `chapter:${chapter.index}`;
  return useQuizStore.getState().quizzes
    .filter((quiz) => quiz.kind === 'flashcard' && !quiz.archived && quiz.tags?.includes(tag))
    .flatMap((quiz) => quiz.questions.map((question) => question.text));
}

/** Salvează pachetul și îi întoarce id-ul. */
export function saveFlashcardDeck(deck: Quiz): string {
  useQuizStore.getState().addQuiz(deck);
  return deck.id;
}

/** Fronturile deja existente într-un folder, ca un pachet nou să nu repete ce ai deja acolo. */
export function frontsInFolder(folderId: string | null): string[] {
  if (!folderId) return [];
  return useQuizStore.getState().quizzes
    .filter((quiz) => quiz.folderId === folderId && quiz.kind === 'flashcard')
    .flatMap((quiz) => quiz.questions.map((question) => question.text));
}

