/**
 * Conversational memory for the AI chat — pure logic + localStorage persistence,
 * no network. Three layers live here:
 *
 *  1. Durable facts about the student (goals, preferences, recurring struggles,
 *     commitments), shared by every chat thread of a profile.
 *  2. Per-thread running summaries that survive reloads (they used to live in
 *     refs and vanished with the page).
 *  3. Prompt-budget helpers (history fitting, tone, "does this answer need a
 *     second look") used when assembling a request.
 *
 * The LLM-backed pieces (extracting facts, verifying answers) are in
 * chatMemoryAI.ts so this file stays deterministic and unit-testable.
 */

export type MemoryKind = 'goal' | 'preference' | 'struggle' | 'fact' | 'commitment';

export const MEMORY_KINDS: readonly MemoryKind[] = ['goal', 'preference', 'struggle', 'fact', 'commitment'];

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  goal: 'Obiectiv',
  preference: 'Preferință',
  struggle: 'Dificultate',
  fact: 'Despre tine',
  commitment: 'De reluat',
};

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  text: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  uses: number;
  pinned: boolean;
}

export interface MemoryCandidate {
  kind: MemoryKind;
  text: string;
}

export const MEMORY_LIMIT = 60;
const MEMORY_TEXT_MIN = 8;
const MEMORY_TEXT_MAX = 220;
/** Two memories of the same kind with at least this token overlap are the same fact. */
const DUPLICATE_SIMILARITY = 0.6;

/** How many trailing chat messages are persisted (mirrors useChatMessages). */
export const PERSISTED_MESSAGE_LIMIT = 60;

// ── Storage ────────────────────────────────────────────────────────────────

const memoryKey = (profileId: string) => `studyx-chat-memory-${profileId}`;
const summaryKey = (profileId: string, thread: string) => `studyx-chat-summary-${profileId}-${thread}`;
const lastActiveKey = (profileId: string, thread: string) => `studyx-chat-lastactive-${profileId}-${thread}`;
const ENABLED_KEY = 'studyx-chat-memory-enabled';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded / storage blocked — memory is best-effort
  }
}

export function isMemoryEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setMemoryEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

function sanitizeItem(raw: unknown): MemoryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MemoryItem>;
  if (typeof r.id !== 'string' || typeof r.text !== 'string') return null;
  if (!MEMORY_KINDS.includes(r.kind as MemoryKind)) return null;
  const text = r.text.trim();
  if (!text) return null;
  return {
    id: r.id,
    kind: r.kind as MemoryKind,
    text: text.slice(0, MEMORY_TEXT_MAX),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
    lastUsedAt: typeof r.lastUsedAt === 'number' ? r.lastUsedAt : null,
    uses: typeof r.uses === 'number' && r.uses >= 0 ? r.uses : 0,
    pinned: r.pinned === true,
  };
}

export function loadMemories(profileId: string): MemoryItem[] {
  const key = memoryKey(profileId);
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Unreadable: the next save would overwrite it with an empty list, so keep the bytes.
      // One stable backup key: loadMemories runs on every message, so don't mint a new copy each time.
      try {
        if (localStorage.getItem(`${key}__corrupt`) === null) localStorage.setItem(`${key}__corrupt`, raw);
      } catch {
        // out of space — the original is still in place
      }
      return [];
    }
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(sanitizeItem).filter((item): item is MemoryItem => item !== null);
}

export function saveMemories(profileId: string, items: MemoryItem[]): void {
  writeJson(memoryKey(profileId), items);
}

export function clearMemories(profileId: string): void {
  try {
    localStorage.removeItem(memoryKey(profileId));
  } catch {
    // ignore
  }
}

// ── Text helpers ───────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'este', 'sunt', 'care', 'sau', 'dar', 'pentru', 'din', 'cand', 'cum', 'mai', 'foarte', 'unde', 'atunci',
  'prin', 'spre', 'fara', 'sub', 'peste', 'dupa', 'inainte', 'acest', 'aceasta', 'aceste', 'acesta',
  'cel', 'cea', 'cei', 'cele', 'pot', 'poti', 'vreau', 'vrei', 'are', 'avea', 'fost', 'fii', 'nici',
  'tot', 'toate', 'toti', 'ceva', 'nimic', 'despre', 'studentul', 'utilizatorul', 'utilizator',
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Diacritic-free 6-char stems: "hipertensiunii" and "hipertensiune" collapse to the same token. */
export function stemTokens(value: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalizeText(value).split(' ')) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    out.add(word.length > 6 ? word.slice(0, 6) : word);
  }
  return out;
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

function newId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ── Memory maintenance ─────────────────────────────────────────────────────

export function cleanCandidateText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/^[-•*\s]+/, '').trim().slice(0, MEMORY_TEXT_MAX);
}

export function isValidCandidate(candidate: unknown): candidate is MemoryCandidate {
  if (!candidate || typeof candidate !== 'object') return false;
  const c = candidate as Partial<MemoryCandidate>;
  if (!MEMORY_KINDS.includes(c.kind as MemoryKind) || typeof c.text !== 'string') return false;
  const text = cleanCandidateText(c.text);
  return text.length >= MEMORY_TEXT_MIN;
}

function evictionOrder(a: MemoryItem, b: MemoryItem): number {
  // Least valuable first: rarely used, long unused, old.
  const value = (m: MemoryItem) => (m.lastUsedAt ?? m.updatedAt) + m.uses * 3 * 24 * 3600 * 1000;
  return value(a) - value(b);
}

/**
 * Folds new candidates into the stored list: near-duplicates update the existing
 * entry (newest wording wins, pin/usage are kept), the rest are appended, and the
 * list is trimmed to MEMORY_LIMIT by dropping the least valuable unpinned entries.
 */
export function mergeMemories(existing: MemoryItem[], candidates: MemoryCandidate[], now = Date.now()): MemoryItem[] {
  const items = existing.map((item) => ({ ...item }));

  for (const candidate of candidates) {
    if (!isValidCandidate(candidate)) continue;
    const text = cleanCandidateText(candidate.text);
    const tokens = stemTokens(text);
    let best: MemoryItem | null = null;
    let bestScore = 0;
    for (const item of items) {
      if (item.kind !== candidate.kind) continue;
      const score = similarity(tokens, stemTokens(item.text));
      if (score > bestScore) { best = item; bestScore = score; }
    }
    if (best && bestScore >= DUPLICATE_SIMILARITY) {
      best.text = text;
      best.updatedAt = now;
    } else {
      items.push({
        id: newId(), kind: candidate.kind, text,
        createdAt: now, updatedAt: now, lastUsedAt: null, uses: 0, pinned: false,
      });
    }
  }

  if (items.length <= MEMORY_LIMIT) return items;
  const removable = items.filter((m) => !m.pinned).sort(evictionOrder);
  const dropIds = new Set(removable.slice(0, items.length - MEMORY_LIMIT).map((m) => m.id));
  return items.filter((m) => !dropIds.has(m.id));
}

const KIND_WEIGHT: Record<MemoryKind, number> = {
  goal: 1.5, preference: 1.5, commitment: 1, fact: 0.6, struggle: 0.4,
};

/**
 * Picks the memories worth showing the model for THIS message. Goals and
 * preferences (who the student is, how they like to learn) and pinned entries are
 * always eligible; struggles/facts/commitments only when they overlap the topic.
 */
export function selectRelevantMemories(items: MemoryItem[], query: string, limit = 6, now = Date.now()): MemoryItem[] {
  if (items.length === 0) return [];
  const queryTokens = stemTokens(query);
  const scored: { item: MemoryItem; score: number }[] = [];

  for (const item of items) {
    const overlap = (() => {
      const itemTokens = stemTokens(item.text);
      let shared = 0;
      for (const token of itemTokens) if (queryTokens.has(token)) shared++;
      return shared;
    })();
    const alwaysOn = item.pinned || item.kind === 'goal' || item.kind === 'preference';
    if (overlap === 0 && !alwaysOn) continue;
    const ageDays = Math.max(0, (now - item.updatedAt) / (24 * 3600 * 1000));
    const recency = 1 / (1 + ageDays / 30);
    const score = overlap * 2 + KIND_WEIGHT[item.kind] + (item.pinned ? 3 : 0) + recency * 0.5;
    scored.push({ item, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.item);
}

export function formatMemoryBlock(items: MemoryItem[]): string {
  return items.map((item) => `- [${MEMORY_KIND_LABEL[item.kind].toLowerCase()}] ${item.text}`).join('\n');
}

export function markMemoriesUsed(profileId: string, ids: string[], now = Date.now()): void {
  if (ids.length === 0) return;
  const set = new Set(ids);
  const items = loadMemories(profileId).map((item) => (
    set.has(item.id) ? { ...item, uses: item.uses + 1, lastUsedAt: now } : item
  ));
  saveMemories(profileId, items);
}

export function addMemoryManually(profileId: string, kind: MemoryKind, text: string): MemoryItem[] {
  const merged = mergeMemories(loadMemories(profileId), [{ kind, text }]);
  saveMemories(profileId, merged);
  return merged;
}

export function updateMemory(profileId: string, id: string, patch: Partial<Pick<MemoryItem, 'text' | 'kind' | 'pinned'>>): MemoryItem[] {
  const items = loadMemories(profileId).map((item) => {
    if (item.id !== id) return item;
    const text = patch.text !== undefined ? cleanCandidateText(patch.text) : item.text;
    return { ...item, ...patch, text: text || item.text, updatedAt: Date.now() };
  });
  saveMemories(profileId, items);
  return items;
}

export function deleteMemory(profileId: string, id: string): MemoryItem[] {
  const items = loadMemories(profileId).filter((item) => item.id !== id);
  saveMemories(profileId, items);
  return items;
}

// ── Per-thread summary persistence ─────────────────────────────────────────

export interface ThreadSummaryState {
  summary: string;
  /** Messages folded into `summary`, counted in the in-memory list at save time. */
  covered: number;
  /** Length of that in-memory list at save time (persisted history is trimmed to PERSISTED_MESSAGE_LIMIT). */
  total: number;
  updatedAt: number;
}

export function loadThreadSummary(profileId: string, thread: string): ThreadSummaryState | null {
  const parsed = readJson<Partial<ThreadSummaryState>>(summaryKey(profileId, thread));
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null;
  return {
    summary: parsed.summary,
    covered: typeof parsed.covered === 'number' ? parsed.covered : 0,
    total: typeof parsed.total === 'number' ? parsed.total : 0,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
  };
}

export function saveThreadSummary(profileId: string, thread: string, state: Omit<ThreadSummaryState, 'updatedAt'>): void {
  writeJson(summaryKey(profileId, thread), { ...state, updatedAt: Date.now() });
}

export function clearThreadSummary(profileId: string, thread: string): void {
  try {
    localStorage.removeItem(summaryKey(profileId, thread));
  } catch {
    // ignore
  }
}

/**
 * The stored `covered` index refers to the in-memory list at save time, but only
 * the last PERSISTED_MESSAGE_LIMIT messages survive a reload — so the head that
 * was trimmed shifts every index. Re-base it onto what was actually reloaded.
 */
export function rebaseCoveredCount(state: Pick<ThreadSummaryState, 'covered' | 'total'>, loadedMessageCount: number): number {
  const trimmed = Math.max(0, state.total - PERSISTED_MESSAGE_LIMIT);
  return Math.max(0, Math.min(state.covered - trimmed, loadedMessageCount));
}

export function touchThreadActivity(profileId: string, thread: string, now = Date.now()): void {
  try {
    localStorage.setItem(lastActiveKey(profileId, thread), String(now));
  } catch {
    // ignore
  }
}

export function getThreadLastActive(profileId: string, thread: string): number | null {
  try {
    const raw = localStorage.getItem(lastActiveKey(profileId, thread));
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// ── Prompt budget ──────────────────────────────────────────────────────────

export interface HistoryTurn { role: 'user' | 'assistant'; content: string }

/**
 * Keeps the most recent turns that fit a character budget (≈ tokens × 3.5 for
 * Romanian) instead of a fixed message count — a few long answers no longer
 * crowd out context, and many short turns are no longer cut at an arbitrary 8.
 * Always keeps at least `minMessages`; the oldest turn is trimmed, never dropped
 * mid-way into a fragment that starts with an assistant reply.
 */
export function fitHistoryToBudget(
  history: HistoryTurn[],
  options: { maxChars?: number; minMessages?: number; maxMessages?: number } = {},
): HistoryTurn[] {
  const { maxChars = 6000, minMessages = 2, maxMessages = 20 } = options;
  const kept: HistoryTurn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < maxMessages; i--) {
    const turn = history[i];
    const cost = turn.content.length;
    if (kept.length >= minMessages && used + cost > maxChars) break;
    kept.unshift(turn);
    used += cost;
  }
  // A window that opens on an assistant turn reads as a reply to nothing.
  while (kept.length > minMessages && kept[0].role === 'assistant') kept.shift();
  return kept;
}

// ── Tone ───────────────────────────────────────────────────────────────────

export type StudentState = 'frustrated' | 'confused' | 'normal';

const FRUSTRATED = /\b(nu mai pot|nu mai inteleg nimic|ma enerveaz|sunt epuizat|obosit|iar am gresit|nu ma descurc|de ce nu retin|ma dau batut|disperat|stres)/;
const CONFUSED = /\b(nu inteleg|nu am inteles|nu prind|ma pierd|explica.{0,12}(din nou|altfel|mai simplu)|inca o data|nu mi.?e clar)/;

export function deriveConversationTone(text: string, hour: number): { state: StudentState; late: boolean } {
  const normalized = normalizeText(text);
  const state: StudentState = FRUSTRATED.test(normalized) ? 'frustrated' : CONFUSED.test(normalized) ? 'confused' : 'normal';
  return { state, late: hour >= 23 || hour < 5 };
}

// ── Answer risk ────────────────────────────────────────────────────────────

const CLINICAL_NUMBER = /\b\d+([.,]\d+)?\s*(mg|mcg|µg|g\/dl|g\/l|mg\/dl|mg\/kg|ml\/min|ml\/kg|mmol\/l|meq\/l|mmhg|ui\b|u\/l|iu\b|%|bpm|cmh2o|kpa|mosm|puncte)/i;
const CLINICAL_SCORE = /\b(chads|has-bled|wells|child-pugh|meld|apgar|glasgow|curb-65|sofa|timi|grace|kdigo|duke|framingham)/i;

/** True when an answer carries doses, lab thresholds or named scores — the content where a wrong number hurts. */
export function needsClinicalVerification(answer: string): boolean {
  if (answer.length < 200) return false;
  return CLINICAL_NUMBER.test(answer) || CLINICAL_SCORE.test(answer);
}

// ── Continuity recap ───────────────────────────────────────────────────────

export interface RecapInput {
  memories: MemoryItem[];
  summary: string;
  dueCount: number;
  weakTopic?: string;
  lastActiveAt: number | null;
  now?: number;
}

export interface Recap {
  lines: string[];
  /** Message sent to the assistant when the student accepts the recap. */
  prompt: string;
}

const RECAP_MIN_GAP_MS = 6 * 3600 * 1000;

/** Deterministic (no LLM call): what to pick up when the student comes back after a break. */
export function buildContinuityRecap(input: RecapInput): Recap | null {
  const now = input.now ?? Date.now();
  if (input.lastActiveAt === null || now - input.lastActiveAt < RECAP_MIN_GAP_MS) return null;

  const commitment = input.memories.filter((m) => m.kind === 'commitment').sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const struggle = input.memories.filter((m) => m.kind === 'struggle').sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const lines: string[] = [];
  if (commitment) lines.push(`Ai rămas să reluăm: ${commitment.text}`);
  if (struggle) lines.push(`Punct dificil notat: ${struggle.text}`);
  else if (input.weakTopic) lines.push(`Cel mai slab subiect acum: ${input.weakTopic}`);
  if (input.dueCount > 0) lines.push(`${input.dueCount} itemi de recapitulat azi`);
  if (lines.length === 0 && !input.summary.trim()) return null;
  if (lines.length === 0) lines.push('Avem o conversație începută data trecută.');

  const focus = commitment?.text ?? struggle?.text ?? input.weakTopic;
  const prompt = focus
    ? `Hai să continuăm de unde am rămas: ${focus}. Reia pe scurt esențialul și apoi verifică-mă cu 2-3 întrebări.`
    : 'Hai să continuăm de unde am rămas data trecută. Reia pe scurt și spune-mi cu ce ar fi bine să începem.';
  return { lines: lines.slice(0, 3), prompt };
}
