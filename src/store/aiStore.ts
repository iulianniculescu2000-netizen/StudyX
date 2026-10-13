import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { chunkDocument } from '../ai/chunker';
import { addChunksToVault, clearVault, getPageCoverageBySource, lacksPageInfo, getVaultChunksBySource, removeChunksBySource } from '../ai/vectorStore';
import { retrieveRelevantChunks, type RetrievalScope } from '../ai/retriever';
import { buildNumberedContext, type NumberedContext } from '../ai/contextBuilder';
import { assignPagesToChunks, takePageMap } from '../ai/pageMarkers';
import { currentProfileEpoch, ProfileChangedError } from './profileEpoch';
import { createSafePersistStorage } from './safeStorage';
import { matchBookByName } from '../data/residencyCurriculum';

export type AIModel =
  // Deprecated by Groq (2026-08-16, see console.groq.com/docs/deprecations) —
  // kept in the union only so already-persisted state still type-checks;
  // `normalizeProviderModel` migrates any of these to the current default the
  // next time the store rehydrates. Never offer them in PROVIDER_MODELS again.
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant'
  | 'mixtral-8x7b-32768'
  | 'openai/gpt-oss-120b'
  | 'openai/gpt-oss-20b'
  // Retired by Google (confirmed live, 2026-08-24: all three 404 "no longer
  // available to new users") — same reasoning as the Groq entries above, kept
  // only so persisted state still type-checks and migrates cleanly.
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'
  | 'gemini-2.5-pro'
  | 'gemini-3.8-flash'
  | 'gemini-3.7-flash'
  | 'gemini-3.6-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-pro-preview'
  // Mistral AI (La Plateforme) — 4th free provider, added 2026-09-08 after
  // NVIDIA NIM turned out to reject browser CORS entirely (reverted). Verified
  // THIS time before shipping: CORS confirmed live via curl OPTIONS preflight
  // (returns access-control-allow-origin: *), free "Experiment" tier needs no
  // card (multiple independent sources agree — the "activate billing" step in
  // their console just turns the free tier on, doesn't collect payment info),
  // ~1B tokens/month. "-latest" aliases used deliberately instead of a dated
  // model name — Mistral keeps them pointed at their current model, so this
  // shouldn't go stale the way the NVIDIA pick did within 2 weeks.
  | 'mistral-small-latest'
  | 'mistral-large-latest';

export type AIProvider = 'groq' | 'google' | 'mistral';

export type AIKnowledgeSourceType = 'txt' | 'pdf' | 'docx' | 'image';
export type AIKnowledgeSourceStatus = 'indexing' | 'ready' | 'error';

export type AIStudySessionKind = 'first-pass' | 'recap';

export interface AIStudyPlanChapterRef {
  sourceId: string;
  sourceName: string;
  heading: string;
  label: string;
}

export interface AIStudyPlanSession {
  id: string;
  /** 'YYYY-MM-DD', local calendar date — never toISOString() (shifts a day across timezones). */
  date: string;
  kind: AIStudySessionKind;
  /** 0 = first pass, 1..N = recap pass number. */
  passIndex: number;
  chapters: AIStudyPlanChapterRef[];
  done: boolean;
}

export interface AIExamPlan {
  /** 'YYYY-MM-DD' */
  examDate: string;
  /** 1-10, Romanian grading scale. */
  targetGrade: number;
  generatedAt: number;
  /** Source ids the plan was built from — lets the UI detect newly-added documents. */
  sourceIds: string[];
  sessions: AIStudyPlanSession[];
}

export interface AILibraryFolder {
  id: string;
  name: string;
  emoji: string;
  /** null for a top-level folder; otherwise the id of the parent folder. */
  parentId: string | null;
  createdAt: number;
  /** Absent/null = the exam-plan feature isn't used for this folder. */
  examPlan?: AIExamPlan | null;
}

export interface AIKnowledgeSource {
  id: string;
  name: string;
  type: AIKnowledgeSourceType;
  preview: string;
  charCount: number;
  wordCount: number;
  chunkCount: number;
  qualityScore: number;
  addedAt: number;
  indexStatus: AIKnowledgeSourceStatus;
  indexProgress: number;
  indexError?: string;
  /** Library folder this course belongs to (null = unfiled). */
  folderId?: string | null;
  /** Fișierul din folderul „Capitole” din care vine sursa (sincronizare); lipsește la sursele adăugate manual. */
  sync?: { relPath: string; size: number; mtimeMs: number };
}

export interface AIResponse {
  id: string;
  content: string;
  confidence: number;
  metadata?: {
    type: 'analysis' | 'recommendation' | 'prediction' | 'generation' | 'general' | 'error';
    category?: string;
    sources?: string[];
  };
  timestamp: Date;
}


export type AIMemoryMode = 'grounded' | 'explain' | 'summarize' | 'diagram' | 'test' | 'mnemonic' | string;

export interface AIStudyMemoryProfile {
  profileId: string;
  createdAt: number;
  updatedAt: number;
  interactions: number;
  modeUsage: Record<string, number>;
  sourceUsage: Record<string, number>;
  activeHours: Record<string, number>;
  signals: {
    likesDiagrams: number;
    likesSummaries: number;
    likesTests: number;
    likesMnemonics: number;
    prefersStepByStep: number;
    asksForExamFocus: number;
    usesLibraryContext: number;
  };
  averagePromptLength: number;
  lastMode?: AIMemoryMode;
  lastSourceName?: string;
  recentTopics: string[];
}

export interface AIInteractionMemoryInput {
  mode: AIMemoryMode;
  prompt: string;
  scopedSourceName?: string | null;
  citationsCount?: number;
}

interface AddKnowledgeSourceOptions {
  onIndexProgress?: (progress: { processed: number; total: number; percent: number }) => void;
  /** Fișierul de pe disc din care vine textul (sincronizarea „Capitole”). */
  sync?: AIKnowledgeSource['sync'];
  /** Folderul în care intră sursa de la început (altfel o încărcare întreruptă ar rămâne la „Neclasificate”). */
  folderId?: string | null;
}

export interface AIState {
  isProcessing: boolean;
  currentRequest: string | null;
  lastResponse: AIResponse | null;
  error: string | null;
  /** Active provider's key (kept in sync with providerKeys[provider]). */
  apiKey: string;
  /** Per-provider keys so switching Groq↔Google keeps each key intact. */
  providerKeys: Partial<Record<AIProvider, string>>;
  /**
   * Per-provider model choice — mirrors providerKeys so a background model
   * check (e.g. "Actualizează" in Settings, which verifies every configured
   * provider, not just the active one) can fix a provider you aren't
   * currently using and have it actually stick the next time you switch to it,
   * instead of resetting to the static default.
   */
  providerModels: Partial<Record<AIProvider, AIModel>>;
  provider: AIProvider;
  model: AIModel;
  hasKey: boolean;
  isHydrated: boolean;
  knowledgeSources: AIKnowledgeSource[];
  libraryFolders: AILibraryFolder[];
  cache: {
    size: number;
    lastCleared: number | null;
  };
  studyMemory: Record<string, AIStudyMemoryProfile>;
}

export interface AIActions {
  setError: (error: string | null) => void;
  setApiKey: (apiKey: string) => void;
  setProvider: (provider: AIProvider) => void;
  setModel: (model: AIModel) => void;
  /** Sets the model for ANY provider, not just the active one — used by the multi-provider model check. Keeps `model` in sync only if that provider happens to be active right now. */
  setProviderModel: (provider: AIProvider, model: AIModel) => void;
  addKnowledgeSource: (
    name: string,
    text: string,
    type?: AIKnowledgeSourceType,
    options?: AddKnowledgeSourceOptions,
  ) => Promise<AIKnowledgeSource>;
  removeKnowledgeSource: (sourceId: string) => Promise<void>;
  /** Id-urile surselor PDF gata de folosit ale căror fragmente nu au nicio pagină (indexate înainte de markerii de pagină). */
  findSourcesWithoutPages: () => Promise<string[]>;
  /**
   * Reindexează o sursă existentă din textul NOU al aceluiași PDF (octeții originali nu se păstrează).
   * Păstrează id/nume/folder; vechile fragmente se înlocuiesc dintr-o singură scriere abia după ce
   * cele noi sunt gata, deci orice eșec / anulare / schimbare de profil lasă indexul vechi intact.
   */
  reindexKnowledgeSource: (
    sourceId: string,
    text: string,
    options?: { signal?: AbortSignal; onIndexProgress?: (progress: { processed: number; total: number; percent: number }) => void },
  ) => Promise<AIKnowledgeSource>;
  addLibraryFolder: (name: string, emoji?: string, parentId?: string | null) => string;
  renameLibraryFolder: (folderId: string, name: string) => void;
  deleteLibraryFolder: (folderId: string) => void;
  moveSourceToLibraryFolder: (sourceId: string, folderId: string | null) => void;
  setFolderExamPlan: (folderId: string, plan: AIExamPlan | null) => void;
  toggleExamPlanSession: (folderId: string, sessionId: string) => void;
  getKnowledgeContext: (query: string, maxChars?: number) => Promise<string>;
  /** Ca `getKnowledgeContext`, plus sursele numerotate (pagină, capitol) ca UI-ul să poată lega `[n]` din răspuns de ele. */
  getKnowledgeContextWithSources: (query: string, maxChars?: number, options?: { activeHeading?: string; activeScope?: RetrievalScope }) => Promise<NumberedContext>;
  clearCache: () => void;
  updateCacheSize: () => void;
  recordAIInteraction: (profileId: string, input: AIInteractionMemoryInput) => void;
  getAIMemoryContext: (profileId: string) => string;
  clearAIMemory: (profileId?: string) => void;
  reset: () => void;
  /** Per-profile: knowledge sources + library folders load/save through profileStorage.ts, not the global zustand persist blob. */
  _hydrate: (data: { knowledgeSources: AIKnowledgeSource[]; libraryFolders: AILibraryFolder[] }) => void;
  /** Sources left "indexing" by an interrupted run (closed app, profile switch): ready if their chunks exist, else error. */
  reconcileInterruptedIndexing: () => Promise<void>;
  _snapshot: () => { knowledgeSources: AIKnowledgeSource[]; libraryFolders: AILibraryFolder[] };
}

const DEFAULT_MODEL: AIModel = 'openai/gpt-oss-120b';
const PROVIDER_MODELS: Record<AIProvider, AIModel[]> = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  google: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview'],
  mistral: ['mistral-small-latest', 'mistral-large-latest'],
};

/** AI local pregătit de folosit: activat, cu adresă locală validă și model ales. Fără el, `hasKey` ține cont doar de cheile cloud. */
function isValidProviderKey(provider: AIProvider, apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) return false;
  // Groq keys are reliably prefixed with "gsk_".
  if (provider === 'groq') return trimmed.startsWith('gsk_') && trimmed.length > 20;
  // Google/Gemini and Mistral keys are both opaque tokens with no distinctive
  // prefix, so don't gate on one. Accept any substantial key that isn't a
  // Groq key; the live API check decides the rest.
  return trimmed.length >= 20 && !trimmed.startsWith('gsk_');
}

function getDefaultModelForProvider(provider: AIProvider): AIModel {
  if (provider === 'google') return 'gemini-3.8-flash';
  if (provider === 'mistral') return 'mistral-small-latest';
  // groq
  return DEFAULT_MODEL;
}

function normalizeProviderModel(provider: AIProvider, model: AIModel | string | undefined): AIModel {
  if (model && PROVIDER_MODELS[provider].includes(model as AIModel)) {
    return model as AIModel;
  }
  return getDefaultModelForProvider(provider);
}

/** Providers that have a saved key, each with the model that would run on it (the active one uses `model`). */
export function getConfiguredProviderModels(
  state: Pick<AIState, 'providerKeys' | 'providerModels' | 'provider' | 'model' | 'apiKey'>,
): Array<{ provider: AIProvider; model: string }> {
  const order: AIProvider[] = ['groq', 'google', 'mistral'];
  return order
    .filter((p) => Boolean((state.providerKeys[p] ?? (p === state.provider ? state.apiKey : '') ?? '').trim()))
    .map((p) => ({
      provider: p,
      model: p === state.provider ? state.model : normalizeProviderModel(p, state.providerModels[p] ?? getDefaultModelForProvider(p)),
    }));
}

const createDefaultState = (): AIState => ({
  isProcessing: false,
  currentRequest: null,
  lastResponse: null,
  error: null,
  apiKey: '',
  providerKeys: {},
  providerModels: {},
  provider: 'groq',
  model: DEFAULT_MODEL,
  hasKey: false,
  isHydrated: false,
  knowledgeSources: [],
  libraryFolders: [],
  cache: {
    size: 0,
    lastCleared: null,
  },
  studyMemory: {},
});

function createMemoryProfile(profileId: string): AIStudyMemoryProfile {
  const now = Date.now();
  return {
    profileId,
    createdAt: now,
    updatedAt: now,
    interactions: 0,
    modeUsage: {},
    sourceUsage: {},
    activeHours: {},
    signals: {
      likesDiagrams: 0,
      likesSummaries: 0,
      likesTests: 0,
      likesMnemonics: 0,
      prefersStepByStep: 0,
      asksForExamFocus: 0,
      usesLibraryContext: 0,
    },
    averagePromptLength: 0,
    recentTopics: [],
  };
}

const SIGNAL_KEYS = [
  'likesDiagrams', 'likesSummaries', 'likesTests', 'likesMnemonics',
  'prefersStepByStep', 'asksForExamFocus', 'usesLibraryContext',
] as const;

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function countRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) out[key] = finiteCount(count);
  return out;
}

/**
 * Repairs a persisted study-memory map: fills fields missing from older/partial saves so
 * recordAIInteraction never throws on them, while keeping every counter that is valid
 * (interactions, signals, usage) exactly as stored. Non-object entries are dropped.
 */
export function normalizeStudyMemory(raw: unknown): Record<string, AIStudyMemoryProfile> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, AIStudyMemoryProfile> = {};
  for (const [profileId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const m = entry as Partial<AIStudyMemoryProfile>;
    const base = createMemoryProfile(profileId);
    const signals = (m.signals && typeof m.signals === 'object' ? m.signals : {}) as Record<string, unknown>;
    out[profileId] = {
      ...base,
      ...m,
      profileId,
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : base.createdAt,
      updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : base.updatedAt,
      interactions: finiteCount(m.interactions),
      modeUsage: countRecord(m.modeUsage),
      sourceUsage: countRecord(m.sourceUsage),
      activeHours: countRecord(m.activeHours),
      signals: Object.fromEntries(SIGNAL_KEYS.map((k) => [k, finiteCount(signals[k])])) as AIStudyMemoryProfile['signals'],
      averagePromptLength: finiteCount(m.averagePromptLength),
      recentTopics: Array.isArray(m.recentTopics) ? m.recentTopics.filter((t): t is string => typeof t === 'string') : [],
    };
  }
  return out;
}

function incrementSignal(current: number, active: boolean) {
  return active ? Math.min(current + 1, 999) : current;
}

function inferTopics(prompt: string) {
  const cleaned = prompt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]+/g, ' ');
  const stopWords = new Set([
    'care', 'este', 'sunt', 'vreau', 'pentru', 'despre', 'din', 'prin', 'cum', 'imi', 'explica',
    'rezuma', 'schema', 'testeaza', 'intrebare', 'intrebari', 'curs', 'document', 'the', 'and',
  ]);
  return cleaned
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !stopWords.has(word))
    .slice(0, 4);
}

function buildMemoryContext(memory?: AIStudyMemoryProfile) {
  if (!memory || memory.interactions < 3) return '';

  const n = memory.interactions;
  const instructions: string[] = [];

  // ── Dominant study subject ────────────────────────────────────────────────
  const topSource = Object.entries(memory.sourceUsage)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topSource) {
    instructions.push(`Subiectul principal de studiu al acestui utilizator este „${topSource}" — ancorează explicațiile în acest domeniu când e posibil.`);
  }

  // ── Response length ───────────────────────────────────────────────────────
  if (memory.averagePromptLength < 50 && n >= 5) {
    instructions.push('Utilizatorul pune întrebări scurte — preferă răspunsuri concise (max 3 paragrafe); nu adăuga context nesolicitat.');
  } else if (memory.averagePromptLength > 130 && n >= 5) {
    instructions.push('Utilizatorul formulează întrebări ample — răspunde structurat și complet, cu titluri și bullet-uri când clarifică.');
  }

  // ── Style signals (activate after 3+ hits for reliability) ────────────────
  const sig = memory.signals;
  if (sig.usesLibraryContext >= 4) {
    instructions.push('Utilizatorul citează des din bibliotecă — ancorează ÎNTOTDEAUNA răspunsul în contextul extras din cursuri; marchează cu „📚" când vine din biblioteca lui.');
  }
  if (sig.likesDiagrams >= 3) instructions.push('Când există un mecanism, diferențial sau algoritm, include OBLIGATORIU o schemă cu săgeți sau tabel compact — nu-l sări.');
  if (sig.likesSummaries >= 3) instructions.push('Termină fiecare răspuns cu o sinteză de 2-3 rânduri cu ideile-cheie.');
  if (sig.likesTests >= 3) instructions.push('După orice explicație, propune spontan 1-2 întrebări rapide de verificare.');
  if (sig.likesMnemonics >= 3) instructions.push('La concepte greu de reținut, adaugă un mnemonic scurt fără să fii cerut.');
  if (sig.prefersStepByStep >= 3) instructions.push('Explică mecanismele pas cu pas (1. → 2. → 3.) înainte de concluzie.');
  if (sig.asksForExamFocus >= 3) instructions.push('Marchează explicit ce e „foarte probabil la examen" și care sunt capcanele frecvente.');

  // ── Dominant chat mode ────────────────────────────────────────────────────
  const topMode = Object.entries(memory.modeUsage).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topMode && topMode !== 'grounded') {
    const modeHint: Record<string, string> = {
      explain: 'Utilizatorul preferă modul Explică — aprofundează mecanismele chiar dacă nu sunt explicit cerute.',
      diagram: 'Utilizatorul preferă modul Scheme — privilegiază reprezentările vizuale textuale.',
      summarize: 'Utilizatorul preferă sinteze — fii direct și dens, fără introduceri lungi.',
      test: 'Utilizatorul preferă modul Test — poți propune mini-quiz-uri spontan.',
      mnemonic: 'Utilizatorul iubește mnemonicele — include-le la fiecare concept nou.',
    };
    if (modeHint[topMode]) instructions.push(modeHint[topMode]);
  }

  // ── Recent topics ─────────────────────────────────────────────────────────
  const recent = memory.recentTopics.slice(0, 4);
  if (recent.length > 0) {
    instructions.push(`Topicuri studiate recent: ${recent.join(', ')} — folosește-le ca referință pentru analogii și exemple.`);
  }

  if (instructions.length === 0) return '';

  return `PROFIL ÎNVĂȚAT (${n} interacțiuni):\n${instructions.map((i) => `• ${i}`).join('\n')}`;
}

function buildSourcePreview(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function estimateQualityScore(text: string, chunkCount: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;

  const alphaRatio = normalized.replace(/[^A-Za-zÀ-ž]/g, '').length / normalized.length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const densityBonus = Math.min(20, Math.round(wordCount / Math.max(chunkCount, 1)));
  const readabilityBonus = alphaRatio > 0.65 ? 22 : alphaRatio > 0.45 ? 14 : 6;

  return Math.max(25, Math.min(98, 40 + readabilityBonus + densityBonus));
}

function updateSourceEntry(
  sources: AIKnowledgeSource[],
  sourceId: string,
  updater: (source: AIKnowledgeSource) => AIKnowledgeSource,
) {
  return sources.map((source) => (source.id === sourceId ? updater(source) : source));
}

/** Legacy sources saved before indexing was tracked have no status; they are usable, so they count as ready. */
export function isSourceReady(source: { indexStatus?: AIKnowledgeSource['indexStatus'] }): boolean {
  return source.indexStatus === 'ready' || source.indexStatus === undefined;
}

/** Chunking + pagini + capitol, la fel pentru indexarea inițială și pentru reindexare. */
async function buildSourceChunks(name: string, normalizedText: string) {
  const curriculumBook = matchBookByName(name);
  const rawChunks = await chunkDocument(normalizedText, name, {
    chunkSize: 1500,
    overlap: 200,
    preserveStructure: true,
    minChunkLength: 100,
    knownHeadings: curriculumBook?.chapters,
  });
  // Pagini (doar când parserul PDF le-a dat) și capitol (doar pentru cărți cu listă verificată).
  const pageMap = takePageMap(normalizedText);
  const pagedChunks = pageMap ? assignPagesToChunks(normalizedText, rawChunks, pageMap) : rawChunks;
  const chunks = curriculumBook
    ? pagedChunks.map((chunk) => (chunk.heading ? { ...chunk, chapter: chunk.heading } : chunk))
    : pagedChunks;
  return { chunks, hasPages: chunks.some((chunk) => typeof chunk.page === 'number') };
}

/** Reindexarea refuză un fișier care dă mult mai puține fragmente decât indexul existent (probabil alt document). */
const REINDEX_MIN_CHUNK_RATIO = 0.4;

export class ReindexCancelledError extends Error {
  constructor() {
    super('Reindexarea a fost anulată; indexul vechi a rămas neschimbat.');
    this.name = 'ReindexCancelledError';
  }
}

/** Documents being indexed right now, so a hydrate does not mistake them for interrupted ones. */
const indexingInFlight = new Set<string>();
const inFlightNames = new Set<string>();

export const useAIStore = create<AIState & AIActions>()(
  devtools(
    persist(
      (set, get) => ({
        ...createDefaultState(),

        setError: (error) => set({ error }, false, 'ai/setError'),

        setApiKey: (apiKey) => {
          const trimmed = apiKey.trim();
          const provider = get().provider;
          set((state) => ({
            apiKey: trimmed,
            providerKeys: { ...state.providerKeys, [provider]: trimmed },
            hasKey: isValidProviderKey(provider, trimmed),
          }), false, 'ai/setApiKey');
        },

        setProvider: (provider) => {
          // Prefer a model already confirmed working for this provider (set by
          // the user, or by the multi-provider model check) over the static
          // default, so a background fix actually sticks on switch-back.
          const nextModel = normalizeProviderModel(provider, get().providerModels[provider] ?? getDefaultModelForProvider(provider));
          // Load the key already saved for this provider so the user doesn't
          // have to re-enter it every time they switch Groq↔Google.
          const nextKey = get().providerKeys[provider] ?? '';
          set({
            provider,
            model: nextModel,
            apiKey: nextKey,
            hasKey: isValidProviderKey(provider, nextKey),
          }, false, 'ai/setProvider');
        },

        setModel: (model) => set((state) => ({
          model,
          providerModels: { ...state.providerModels, [state.provider]: model },
        }), false, 'ai/setModel'),

        setProviderModel: (provider, model) => set((state) => ({
          providerModels: { ...state.providerModels, [provider]: model },
          ...(state.provider === provider ? { model } : {}),
        }), false, 'ai/setProviderModel'),

        addKnowledgeSource: async (name, text, type = 'txt', options = {}) => {
          const trimmedName = name.trim();
          const targetFolderId = options.folderId ?? null;
          const normalizedNameLower = trimmedName.toLowerCase();

          // Deduplicare 1: Dacă există deja o sursă gata sau în indexare cu același nume în același folder
          const existingSource = get().knowledgeSources.find(
            (s) =>
              s.name.trim().toLowerCase() === normalizedNameLower &&
              (targetFolderId === null ? !s.folderId : s.folderId === targetFolderId) &&
              s.indexStatus !== 'error'
          );

          if (existingSource) {
            return existingSource;
          }

          // Deduplicare 2: In-flight locking pe nume pentru a preveni apeluri simultane concurente
          const lockKey = `${normalizedNameLower}:${targetFolderId ?? 'root'}`;
          if (inFlightNames.has(lockKey)) {
            const current = get().knowledgeSources.find(
              (s) => s.name.trim().toLowerCase() === normalizedNameLower
            );
            if (current) return current;
          }
          inFlightNames.add(lockKey);

          const sourceId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
          // The stores are global: if the profile changes while this runs, its results belong to the old one.
          const startedInEpoch = currentProfileEpoch();
          const sameProfile = () => currentProfileEpoch() === startedInEpoch;
          indexingInFlight.add(sourceId);
          const now = Date.now();
          const normalizedText = text.trim();
          const preview = buildSourcePreview(normalizedText);
          const wordCount = normalizedText ? normalizedText.split(/\s+/).filter(Boolean).length : 0;

          const pendingSource: AIKnowledgeSource = {
            id: sourceId,
            name,
            type,
            preview,
            charCount: normalizedText.length,
            wordCount,
            chunkCount: 0,
            qualityScore: estimateQualityScore(normalizedText, 1),
            addedAt: now,
            indexStatus: 'indexing',
            indexProgress: 0,
            ...(options.sync ? { sync: options.sync } : {}),
            ...(options.folderId ? { folderId: options.folderId } : {}),
          };

          set((state) => ({
            knowledgeSources: [pendingSource, ...state.knowledgeSources],
          }), false, 'ai/addKnowledgeSource:start');

          try {
            const { chunks } = await buildSourceChunks(name, normalizedText);

            await addChunksToVault(chunks, name, sourceId, {
              onProgress: (progress) => {
                options.onIndexProgress?.(progress);
                if (!sameProfile()) return;
                set((state) => ({
                  knowledgeSources: updateSourceEntry(state.knowledgeSources, sourceId, (source) => ({
                    ...source,
                    indexProgress: progress.percent,
                  })),
                }), false, 'ai/addKnowledgeSource:progress');
              },
            });

            const readySource: AIKnowledgeSource = {
              ...pendingSource,
              chunkCount: chunks.length,
              qualityScore: estimateQualityScore(normalizedText, chunks.length),
              indexStatus: 'ready',
              indexProgress: 100,
            };

            // The chunks were saved under the profile this started in; the other profile's list is not ours to touch.
            // (The first profile fixes its own entry the next time it loads: see reconcileInterruptedIndexing.)
            if (!sameProfile()) return readySource;

            set((state) => ({
              knowledgeSources: updateSourceEntry(state.knowledgeSources, sourceId, () => readySource),
              cache: {
                ...state.cache,
                size: state.cache.size + chunks.length,
              },
            }), false, 'ai/addKnowledgeSource:complete');

            return readySource;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Indexarea documentului a eșuat.';
            if (!sameProfile()) throw error;
            set((state) => ({
              knowledgeSources: updateSourceEntry(state.knowledgeSources, sourceId, (source) => ({
                ...source,
                indexStatus: 'error',
                indexError: message,
                indexProgress: 0,
              })),
            }), false, 'ai/addKnowledgeSource:error');
            throw error;
          } finally {
            indexingInFlight.delete(sourceId);
            inFlightNames.delete(lockKey);
          }
        },

        reconcileInterruptedIndexing: async () => {
          const stale = get().knowledgeSources.filter((source) => source.indexStatus === 'indexing' && !indexingInFlight.has(source.id));
          if (stale.length === 0) return;
          const startedInEpoch = currentProfileEpoch();
          const found = await Promise.all(stale.map(async (source) => ({
            id: source.id,
            chunks: (await getVaultChunksBySource(source.id)).length,
          })));
          if (currentProfileEpoch() !== startedInEpoch) return;
          set((state) => ({
            knowledgeSources: state.knowledgeSources.map((source) => {
              const result = found.find((entry) => entry.id === source.id);
              if (!result || source.indexStatus !== 'indexing' || indexingInFlight.has(source.id)) return source;
              return result.chunks > 0
                ? { ...source, indexStatus: 'ready' as const, indexProgress: 100, chunkCount: result.chunks }
                : { ...source, indexStatus: 'error' as const, indexProgress: 0, indexError: 'Indexarea a fost întreruptă. Șterge documentul și adaugă-l din nou.' };
            }),
          }), false, 'ai/reconcileInterruptedIndexing');
        },

        findSourcesWithoutPages: async () => {
          const startedInEpoch = currentProfileEpoch();
          const pdfs = get().knowledgeSources.filter((source) => source.type === 'pdf' && isSourceReady(source));
          if (pdfs.length === 0) return [];
          const coverage = await getPageCoverageBySource(pdfs.map((source) => source.id));
          if (currentProfileEpoch() !== startedInEpoch) return [];
          return pdfs.filter((source) => lacksPageInfo(coverage[source.id])).map((source) => source.id);
        },

        reindexKnowledgeSource: async (sourceId, text, options = {}) => {
          const existing = get().knowledgeSources.find((source) => source.id === sourceId);
          if (!existing) throw new Error('Sursa nu mai există în bibliotecă.');
          if (existing.type !== 'pdf') throw new Error('Doar sursele PDF se pot reindexa pentru pagini.');
          if (indexingInFlight.has(sourceId)) throw new Error('Această sursă se indexează deja.');

          const startedInEpoch = currentProfileEpoch();
          const guard = () => {
            if (options.signal?.aborted) throw new ReindexCancelledError();
            if (currentProfileEpoch() !== startedInEpoch) throw new ProfileChangedError();
            if (!get().knowledgeSources.some((source) => source.id === sourceId)) throw new Error('Sursa a fost ștearsă în timpul reindexării.');
          };
          // Sursa rămâne „ready" (indexul vechi se folosește mai departe); `indexingInFlight` doar blochează dublurile.
          indexingInFlight.add(sourceId);
          try {
            guard();
            const normalizedText = text.trim();
            const { chunks, hasPages } = await buildSourceChunks(existing.name, normalizedText);
            guard();
            if (!hasPages) {
              throw new Error('Din acest fișier nu am putut citi numerele paginilor, deci indexul vechi a rămas neschimbat. Încearcă un PDF digital (cu text).');
            }
            if (existing.chunkCount > 0 && chunks.length < existing.chunkCount * REINDEX_MIN_CHUNK_RATIO) {
              throw new Error('Fișierul ales dă mult mai puține fragmente decât cartea indexată; pare alt document. Indexul vechi a rămas neschimbat.');
            }

            await addChunksToVault(chunks, existing.name, sourceId, {
              guard,
              onProgress: (progress) => {
                options.onIndexProgress?.(progress);
              },
            });
            guard();

            const updated: AIKnowledgeSource = {
              ...existing,
              preview: buildSourcePreview(normalizedText),
              charCount: normalizedText.length,
              wordCount: normalizedText ? normalizedText.split(/\s+/).filter(Boolean).length : 0,
              chunkCount: chunks.length,
              qualityScore: estimateQualityScore(normalizedText, chunks.length),
              indexStatus: 'ready',
              indexProgress: 100,
              indexError: undefined,
            };
            set((state) => ({
              knowledgeSources: updateSourceEntry(state.knowledgeSources, sourceId, (source) => ({ ...updated, folderId: source.folderId, name: source.name, id: source.id, addedAt: source.addedAt })),
            }), false, 'ai/reindexKnowledgeSource:complete');
            get().updateCacheSize();
            return updated;
          } finally {
            indexingInFlight.delete(sourceId);
          }
        },

        removeKnowledgeSource: async (sourceId) => {
          await removeChunksBySource(sourceId);
          set((state) => ({
            knowledgeSources: state.knowledgeSources.filter((source) => source.id !== sourceId),
          }), false, 'ai/removeKnowledgeSource');
          get().updateCacheSize();
        },

        addLibraryFolder: (name, emoji = '📚', parentId = null) => {
          const trimmed = name.trim();
          const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
          if (!trimmed) return id;
          set((state) => ({
            libraryFolders: [
              { id, name: trimmed, emoji, parentId: parentId ?? null, createdAt: Date.now() },
              ...state.libraryFolders,
            ],
          }), false, 'ai/addLibraryFolder');
          return id;
        },

        renameLibraryFolder: (folderId, name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          set((state) => ({
            libraryFolders: state.libraryFolders.map((folder) => (
              folder.id === folderId ? { ...folder, name: trimmed } : folder
            )),
          }), false, 'ai/renameLibraryFolder');
        },

        deleteLibraryFolder: (folderId) => {
          set((state) => {
            // Collect the folder and all of its descendants so deleting a parent
            // also removes its subfolders (their documents fall back to Neclasificate).
            const toDelete = new Set<string>([folderId]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const folder of state.libraryFolders) {
                if (folder.parentId && toDelete.has(folder.parentId) && !toDelete.has(folder.id)) {
                  toDelete.add(folder.id);
                  changed = true;
                }
              }
            }
            return {
              libraryFolders: state.libraryFolders.filter((folder) => !toDelete.has(folder.id)),
              knowledgeSources: state.knowledgeSources.map((source) => (
                source.folderId && toDelete.has(source.folderId) ? { ...source, folderId: null } : source
              )),
            };
          }, false, 'ai/deleteLibraryFolder');
        },

        moveSourceToLibraryFolder: (sourceId, folderId) => {
          set((state) => ({
            knowledgeSources: state.knowledgeSources.map((source) => (
              source.id === sourceId ? { ...source, folderId } : source
            )),
          }), false, 'ai/moveSourceToLibraryFolder');
        },

        setFolderExamPlan: (folderId, plan) => {
          set((state) => ({
            libraryFolders: state.libraryFolders.map((folder) => (
              folder.id === folderId ? { ...folder, examPlan: plan } : folder
            )),
          }), false, 'ai/setFolderExamPlan');
        },

        toggleExamPlanSession: (folderId, sessionId) => {
          set((state) => ({
            libraryFolders: state.libraryFolders.map((folder) => {
              if (folder.id !== folderId || !folder.examPlan) return folder;
              return {
                ...folder,
                examPlan: {
                  ...folder.examPlan,
                  sessions: folder.examPlan.sessions.map((session) => (
                    session.id === sessionId ? { ...session, done: !session.done } : session
                  )),
                },
              };
            }),
          }), false, 'ai/toggleExamPlanSession');
        },

        getKnowledgeContext: async (query, maxChars = 6000) => {
          return (await get().getKnowledgeContextWithSources(query, maxChars)).context;
        },

        getKnowledgeContextWithSources: async (query, maxChars = 6000, options = {}) => {
          const empty: NumberedContext = { context: '', sources: [] };
          const allSources = get().knowledgeSources;
          // Doar surse gata (cele vechi, fără stare, contează ca gata); cele în curs de indexare sau cu eroare nu intră.
          if (!allSources.some((source) => isSourceReady(source))) return empty;
          const excludeSourceIds = allSources.filter((source) => !isSourceReady(source)).map((source) => source.id);

          // Aceeași cale hibridă ca în chat (retriever.ts); rezultatul unei interogări pornite pe alt profil se aruncă.
          const startedInEpoch = currentProfileEpoch();
          let chunks;
          try {
            chunks = await retrieveRelevantChunks(query, null, 10, { excludeSourceIds, activeHeading: options.activeHeading, activeScope: options.activeScope });
          } catch (error) {
            console.warn('Căutarea în bibliotecă a eșuat; răspund fără context din bibliotecă.', error);
            return empty;
          }
          if (currentProfileEpoch() !== startedInEpoch) return empty;
          if (chunks.length === 0) return empty;

          return buildNumberedContext(chunks, maxChars);
        },

        clearCache: () => {
          void clearVault();
          set((state) => ({
            cache: {
              ...state.cache,
              size: 0,
              lastCleared: Date.now(),
            },
          }), false, 'ai/clearCache');
        },

        updateCacheSize: () => set((state) => ({
          cache: {
            ...state.cache,
            size: state.knowledgeSources.reduce((sum, source) => sum + source.chunkCount, 0),
          },
        }), false, 'ai/updateCacheSize'),

        recordAIInteraction: (profileId, input) => {
          const prompt = input.prompt.trim();
          if (!profileId || !prompt) return;

          set((state) => {
            const current = state.studyMemory[profileId] ?? createMemoryProfile(profileId);
            const nextInteractions = current.interactions + 1;
            const hour = String(new Date().getHours()).padStart(2, '0');
            const lowerPrompt = prompt.toLowerCase();
            const topics = inferTopics(prompt);
            const recentTopics = [
              ...topics,
              ...current.recentTopics.filter((topic) => !topics.includes(topic)),
            ].slice(0, 12);
            const sourceName = input.scopedSourceName?.trim() || current.lastSourceName;

            const nextMemory: AIStudyMemoryProfile = {
              ...current,
              updatedAt: Date.now(),
              interactions: nextInteractions,
              modeUsage: {
                ...current.modeUsage,
                [input.mode]: (current.modeUsage[input.mode] ?? 0) + 1,
              },
              sourceUsage: sourceName
                ? {
                    ...current.sourceUsage,
                    [sourceName]: (current.sourceUsage[sourceName] ?? 0) + 1,
                  }
                : current.sourceUsage,
              activeHours: {
                ...current.activeHours,
                [hour]: (current.activeHours[hour] ?? 0) + 1,
              },
              signals: {
                likesDiagrams: incrementSignal(current.signals.likesDiagrams, input.mode === 'diagram' || /schema|diagram|tabel|algoritm/.test(lowerPrompt)),
                likesSummaries: incrementSignal(current.signals.likesSummaries, input.mode === 'summarize' || /rezuma|sinteza|scurt|idei/.test(lowerPrompt)),
                likesTests: incrementSignal(current.signals.likesTests, input.mode === 'test' || /test|intreba|quiz|grila/.test(lowerPrompt)),
                likesMnemonics: incrementSignal(current.signals.likesMnemonics, input.mode === 'mnemonic' || /mnemonic|retin|memorez/.test(lowerPrompt)),
                prefersStepByStep: incrementSignal(current.signals.prefersStepByStep, input.mode === 'explain' || /pas cu pas|explica|mecanism|de ce/.test(lowerPrompt)),
                asksForExamFocus: incrementSignal(current.signals.asksForExamFocus, /examen|prof|capcana|probabil|cerut/.test(lowerPrompt)),
                usesLibraryContext: incrementSignal(
                  current.signals.usesLibraryContext,
                  (input.citationsCount ?? 0) > 0,
                ),
              },
              averagePromptLength: Math.round(((current.averagePromptLength * current.interactions) + prompt.length) / nextInteractions),
              lastMode: input.mode,
              lastSourceName: sourceName,
              recentTopics,
            };

            return {
              studyMemory: {
                ...state.studyMemory,
                [profileId]: nextMemory,
              },
            };
          }, false, 'ai/recordAIInteraction');
        },

        getAIMemoryContext: (profileId) => buildMemoryContext(get().studyMemory[profileId]),

        clearAIMemory: (profileId) => set((state) => {
          if (!profileId) return { studyMemory: {} };
          const next = { ...state.studyMemory };
          delete next[profileId];
          return { studyMemory: next };
        }, false, 'ai/clearAIMemory'),

        _hydrate: (data) => set({
          knowledgeSources: data.knowledgeSources ?? [],
          libraryFolders: data.libraryFolders ?? [],
        }, false, 'ai/_hydrate'),
        _snapshot: () => ({ knowledgeSources: get().knowledgeSources, libraryFolders: get().libraryFolders }),

        reset: () => {
          void clearVault();
          set({
            ...createDefaultState(),
            isHydrated: true,
          }, false, 'ai/reset');
        },
      }),
      {
        name: 'ai-store',
        // A corrupt blob is quarantined instead of being overwritten (it holds API keys + study memory).
        storage: createSafePersistStorage(),
        partialize: (state) => ({
          apiKey: state.apiKey,
          providerKeys: state.providerKeys,
          providerModels: state.providerModels,
          provider: state.provider,
          model: state.model,
          hasKey: state.hasKey,
          cache: state.cache,
          studyMemory: state.studyMemory,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          // Migrate users from the removed DeepSeek provider to Groq; their old
          // sk- key won't be a Google key, so drop it and require reconfig.
          if ((state.provider as string) === 'deepseek') {
            state.provider = 'groq';
            state.apiKey = '';
          }
          // Cerebras was removed: drop its key/model and move to a provider that
          // still has a saved key (else Groq), so nothing crashes on stale state.
          const legacyKeys = (state.providerKeys ?? {}) as Record<string, string | undefined>;
          const legacyModels = (state.providerModels ?? {}) as Record<string, AIModel | undefined>;
          if ((state.provider as string) === 'cerebras') {
            const fallback = (['groq', 'google', 'mistral'] as AIProvider[]).find((p) => (legacyKeys[p] ?? '').trim());
            state.provider = fallback ?? 'groq';
            state.apiKey = '';
            state.model = getDefaultModelForProvider(state.provider);
          }
          delete legacyKeys.cerebras;
          delete legacyModels.cerebras;
          state.providerKeys = legacyKeys as Partial<Record<AIProvider, string>>;
          state.providerModels = legacyModels as Partial<Record<AIProvider, AIModel>>;
          state.provider = state.provider ?? 'groq';
          state.model = normalizeProviderModel(state.provider, state.model);
          // Drop any per-provider model that's since been retired (same reasoning
          // as the active-model normalize above) — a stale entry here would
          // silently resurface a dead model the next time that provider becomes active.
          const cleanedProviderModels: Partial<Record<AIProvider, AIModel>> = {};
          for (const [key, value] of Object.entries(state.providerModels ?? {})) {
            const providerKey = key as AIProvider;
            if (value && PROVIDER_MODELS[providerKey]?.includes(value)) {
              cleanedProviderModels[providerKey] = value;
            }
          }
          state.providerModels = cleanedProviderModels;
          // Migrate the old single-key storage into per-provider keys. Seed the
          // active provider's slot from the legacy key (only if it's the right
          // format for that provider), then make apiKey reflect the active slot.
          const migratedKeys: Partial<Record<AIProvider, string>> = { ...(state.providerKeys ?? {}) };
          if (state.apiKey && migratedKeys[state.provider] === undefined) {
            if (isValidProviderKey(state.provider, state.apiKey)) {
              migratedKeys[state.provider] = state.apiKey;
            }
          }
          state.providerKeys = migratedKeys;
          state.apiKey = migratedKeys[state.provider] ?? '';
          state.hasKey = isValidProviderKey(state.provider, state.apiKey);
          state.isHydrated = true;
          state.libraryFolders = (state.libraryFolders ?? []).map((folder) => ({
            ...folder,
            parentId: folder.parentId ?? null,
          }));
          state.cache = {
            size: (state.knowledgeSources ?? []).reduce((sum, source) => sum + source.chunkCount, 0),
            lastCleared: typeof state.cache?.lastCleared === 'number' ? state.cache.lastCleared : null,
          };
          state.studyMemory = normalizeStudyMemory(state.studyMemory);
        },
      },
    ),
  ),
);
