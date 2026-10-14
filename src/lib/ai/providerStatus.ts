/**
 * Starea reală a fiecărui model la fiecare furnizor, ca interfața să nu mai ghicească.
 *
 * Surse, în ordinea importanței: cheia respinsă (o verificare), modelul retras (o verificare: un ping real, nu catalogul /models,
 * care mai listează modele moarte), pauza de cotă din `quotaGuard` (din cererile reale și din verificări), limita de cereri
 * și, la urmă, ultimul ping reușit. Verificările se păstrează în localStorage legate de o amprentă a cheii (nu cheia): schimbi cheia,
 * verificările vechi nu mai contează.
 */
import { useAIStore, type AIModel } from '../../store/aiStore';
import { useToastStore } from '../../store/toastStore';
import { isDailyQuotaError, isAuthFailure, modelCooldownUntil, noteModelFailure } from '../groqCore/quotaGuard';
import { rateLimitWaitSeconds } from './friendlyError';
import { CHAT_ENDPOINT, MODELS_ENDPOINT, modelSwitchMessage, providerDisplayName } from './modelHealing';
import { MODEL_CANDIDATES, MODEL_OPTIONS, isModelUnavailableError, type ProviderId } from './modelCatalog';

export const PROVIDER_IDS: readonly ProviderId[] = ['groq', 'google', 'mistral'];

/** Mistral cere cel mult o cerere pe secundă; marja de 100 ms evită limita la prima cerere. */
export const MISTRAL_SPACING_MS = 1100;
export const MISTRAL_LIMITS_URL = 'https://admin.mistral.ai/plateforme/limits';

const PROBES_KEY = 'studyx-model-probes';
const DISCOVERED_KEY = 'studyx-discovered-models';
const PING_TIMEOUT_MS = 10_000;
const RATE_AS_QUOTA_AFTER_SECONDS = 600;
const SHORT_COOLDOWN_AS_RATE_MS = 120_000;
const UNKNOWN_RATE_WAIT_SECONDS = 60;
const RETIRED_VALID_MS = 14 * 24 * 3600_000;

export type ProbeOutcome =
  | { kind: 'ok' }
  | { kind: 'quota'; waitSeconds: number | null }
  | { kind: 'rate'; waitSeconds: number | null }
  | { kind: 'keyRejected' }
  | { kind: 'retired' }
  | { kind: 'error'; detail: string };

export type ModelStatus =
  | { kind: 'ok'; at: number }
  | { kind: 'quota'; until: number }
  | { kind: 'rate'; retryInSeconds: number }
  | { kind: 'keyRejected' }
  | { kind: 'retired' }
  | { kind: 'error'; detail: string }
  | { kind: 'unknown' };

interface StoredProbe {
  outcome: ProbeOutcome;
  at: number;
  fp: string;
}

/** Amprentă scurtă a cheii (FNV-1a): doar ca să știm că verificarea a fost făcută cu aceeași cheie. Nu se poate reface cheia din ea. */
export function keyFingerprint(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

const probeId = (provider: ProviderId, model: string) => `${provider}:${model}`;

function readProbes(): Record<string, StoredProbe> {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROBES_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, StoredProbe> : {};
  } catch {
    return {};
  }
}

function writeProbe(provider: ProviderId, model: string, key: string, outcome: ProbeOutcome, now: number): void {
  try {
    const all = readProbes();
    all[probeId(provider, model)] = { outcome, at: now, fp: keyFingerprint(key) };
    localStorage.setItem(PROBES_KEY, JSON.stringify(all));
  } catch {
    /* fără localStorage: starea rămâne necunoscută la următoarea deschidere */
  }
}

/** Retras după o cerere reală (nu doar după o verificare): îl poate apela și calea de cereri. */
export function markModelRetired(provider: ProviderId, model: string, key: string, now = Date.now()): void {
  writeProbe(provider, model, key, { kind: 'retired' }, now);
}

/** Secunde de așteptare cerute de răspunsul 429: antetul Retry-After, „retryDelay” (Gemini) sau textul „try again in …”. */
function waitFromResponse(text: string, retryAfterHeader: string | null): number | null {
  const header = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(header) && header > 0) return header;
  const delay = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i.exec(text);
  if (delay) return Number(delay[1]);
  return rateLimitWaitSeconds(text);
}

/** Traduce un răspuns la ping într-un rezultat. Pură: se testează fără rețea. */
export function classifyProbe(status: number, bodyText: string, retryAfterHeader: string | null = null): ProbeOutcome {
  if (status >= 200 && status < 300) return { kind: 'ok' };
  if (status === 404 || isModelUnavailableError(bodyText)) return { kind: 'retired' };
  if (status === 429) {
    const wait = waitFromResponse(bodyText, retryAfterHeader);
    if (isDailyQuotaError(bodyText) || /perday|per day/i.test(bodyText) || (wait !== null && wait > RATE_AS_QUOTA_AFTER_SECONDS)) {
      return { kind: 'quota', waitSeconds: wait };
    }
    return { kind: 'rate', waitSeconds: wait };
  }
  if (status === 401 || status === 403 || isAuthFailure(bodyText)) return { kind: 'keyRejected' };
  return { kind: 'error', detail: status >= 500 ? `serviciul răspunde cu eroare (${status})` : `răspuns neașteptat (${status})` };
}

export interface ProbeOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Un ping real: o cerere cu un singur token. Rezultatul se păstrează și, la cotă/limită, intră și în pauzele din `quotaGuard`. */
export async function probeModel(provider: ProviderId, model: string, key: string, options: ProbeOptions = {}): Promise<ProbeOutcome> {
  const { signal, fetchImpl = fetch, now = Date.now } = options;
  const timeout = AbortSignal.timeout(PING_TIMEOUT_MS);
  let outcome: ProbeOutcome;
  let text = '';
  try {
    const res = await fetchImpl(CHAT_ENDPOINT[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    text = res.ok ? '' : await res.text().catch(() => '');
    outcome = classifyProbe(res.status, text, res.headers?.get?.('retry-after') ?? null);
  } catch (error) {
    if (signal?.aborted) throw error;
    outcome = { kind: 'error', detail: 'fără răspuns (verifică conexiunea)' };
  }
  writeProbe(provider, model, key, outcome, now());
  if (outcome.kind === 'quota' || outcome.kind === 'rate') {
    const known = outcome.waitSeconds !== null && !/try again|retry/i.test(text) ? ` Please try again in ${Math.ceil(outcome.waitSeconds)}s.` : '';
    const daily = outcome.kind === 'quota' && !isDailyQuotaError(text) ? ' (per day)' : '';
    noteModelFailure(provider, model, `429 rate limit ${text}${daily}${known}`, now());
  }
  return outcome;
}

function providerKey(provider: ProviderId): string {
  const state = useAIStore.getState();
  return (state.providerKeys[provider] ?? (provider === state.provider ? state.apiKey : '') ?? '').trim();
}

/** Starea unui model pentru cheia dată. `now` vine de la apelant (nu se citește ceasul în randare). */
export function getModelStatus(provider: ProviderId, model: string, key: string, now: number): ModelStatus {
  if (!key.trim()) return { kind: 'unknown' };
  const fp = keyFingerprint(key.trim());
  const probes = readProbes();
  const own = probes[probeId(provider, model)];
  const valid = own && own.fp === fp ? own : null;

  const rejected = Object.entries(probes).some(
    ([id, probe]) => id.startsWith(`${provider}:`) && probe.fp === fp && probe.outcome.kind === 'keyRejected',
  );
  if (rejected) return { kind: 'keyRejected' };
  if (valid?.outcome.kind === 'retired' && now - valid.at < RETIRED_VALID_MS) return { kind: 'retired' };

  const until = modelCooldownUntil(provider, model, now);
  if (until !== null) {
    return until - now <= SHORT_COOLDOWN_AS_RATE_MS
      ? { kind: 'rate', retryInSeconds: Math.max(1, Math.ceil((until - now) / 1000)) }
      : { kind: 'quota', until };
  }
  if (valid?.outcome.kind === 'rate') {
    const remaining = Math.ceil((valid.at + (valid.outcome.waitSeconds ?? UNKNOWN_RATE_WAIT_SECONDS) * 1000 - now) / 1000);
    if (remaining > 0) return { kind: 'rate', retryInSeconds: remaining };
  }
  if (valid?.outcome.kind === 'ok') return { kind: 'ok', at: valid.at };
  if (valid?.outcome.kind === 'error') return { kind: 'error', detail: valid.outcome.detail };
  return { kind: 'unknown' };
}

/** Ultimul rezultat de ping păstrat pentru model și cheia dată (indiferent cât de vechi), sau null. */
export function lastProbeKind(provider: ProviderId, model: string, key: string): ProbeOutcome['kind'] | null {
  const probe = readProbes()[probeId(provider, model)];
  return probe && probe.fp === keyFingerprint(key.trim()) ? probe.outcome.kind : null;
}

/** Pentru lista de alegere: doar un model confirmat retras pentru cheie nu mai poate fi ales (o cheie respinsă se poate repara). */
export function isModelSelectable(status: ModelStatus): boolean {
  return status.kind !== 'retired';
}

// ---------------------------------------------------------------------------------------------------------------------
// Descoperirea modelelor din /v1/models (Mistral: lista se află de la cheia utilizatorului, nu din presupuneri)

export interface DiscoveredModel {
  id: string;
  name?: string;
}

interface RawModelEntry {
  id?: string;
  name?: string;
  capabilities?: { completion_chat?: boolean };
}

const NON_CHAT = /embed|moderation|\bocr\b|-ocr|transcri|whisper|tts|rerank|guard/i;

/** Păstrează doar modelele de chat din răspunsul /v1/models (fără embeddings, moderare, OCR, transcriere). Deduplică după id. */
export function filterChatModels(data: unknown): DiscoveredModel[] {
  const list = (data as { data?: RawModelEntry[] } | null)?.data;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: DiscoveredModel[] = [];
  for (const entry of list) {
    const id = entry?.id?.replace(/^models\//, '');
    if (!id || seen.has(id)) continue;
    if (entry.capabilities && entry.capabilities.completion_chat === false) continue;
    if (NON_CHAT.test(id)) continue;
    seen.add(id);
    out.push({ id, name: typeof entry.name === 'string' ? entry.name : undefined });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function getDiscoveredModels(provider: ProviderId, key: string): DiscoveredModel[] {
  try {
    const all = JSON.parse(localStorage.getItem(DISCOVERED_KEY) ?? '{}') as Record<string, { fp: string; models: DiscoveredModel[] }>;
    const hit = all[provider];
    return hit && hit.fp === keyFingerprint(key.trim()) && Array.isArray(hit.models) ? hit.models : [];
  } catch {
    return [];
  }
}

/** Cere lista de modele a cheii și o păstrează (doar modelele de chat). Întoarce lista sau null când cererea eșuează. */
export async function discoverChatModels(provider: ProviderId, key: string, options: ProbeOptions = {}): Promise<DiscoveredModel[] | null> {
  const { signal, fetchImpl = fetch } = options;
  const timeout = AbortSignal.timeout(PING_TIMEOUT_MS);
  try {
    const res = await fetchImpl(MODELS_ENDPOINT[provider], {
      headers: { Authorization: `Bearer ${key}` },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) return null;
    const models = filterChatModels(await res.json());
    if (models.length === 0) return null;
    try {
      const all = JSON.parse(localStorage.getItem(DISCOVERED_KEY) ?? '{}') as Record<string, unknown>;
      all[provider] = { fp: keyFingerprint(key.trim()), models };
      localStorage.setItem(DISCOVERED_KEY, JSON.stringify(all));
    } catch {
      /* lista rămâne doar pentru această deschidere */
    }
    return models;
  } catch {
    if (signal?.aborted) throw new DOMException('Anulat', 'AbortError');
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Verificarea unui furnizor

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Anulat', 'AbortError')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Anulat', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface VerifyOptions extends ProbeOptions {
  /** Apelat după fiecare ping, ca interfața să arate progresul. */
  onProgress?: () => void;
  /** Pauza dintre cereri la același furnizor (implicit 1,1 s la Mistral, 0 în rest). */
  spacingMs?: number;
}

/**
 * Pinguiește secvențial modelele unui furnizor (un singur token fiecare). Sare modelele cu cota deja epuizată (ar consuma
 * degeaba) și se oprește la prima cheie respinsă sau la prima cădere de rețea. Anulabil prin `signal`.
 */
export async function verifyProvider(provider: ProviderId, models: readonly string[], key: string, options: VerifyOptions = {}): Promise<void> {
  const { signal, onProgress, now = Date.now } = options;
  const spacing = options.spacingMs ?? (provider === 'mistral' ? MISTRAL_SPACING_MS : 0);
  // La Mistral lista modelelor cheii se cere întâi (o singură cerere), deci și primul ping așteaptă pauza.
  let sentBefore = false;
  if (provider === 'mistral') {
    await discoverChatModels(provider, key, options);
    onProgress?.();
    sentBefore = true;
  }
  for (const model of models) {
    if (signal?.aborted) throw new DOMException('Anulat', 'AbortError');
    const until = modelCooldownUntil(provider, model, now());
    // Cota deja epuizată se știe: un ping n-ar afla nimic nou și ar mai consuma o cerere.
    if (until !== null && until - now() > SHORT_COOLDOWN_AS_RATE_MS) continue;
    if (sentBefore && spacing > 0) await sleep(spacing, signal);
    sentBefore = true;
    const outcome = await probeModel(provider, model, key, options);
    onProgress?.();
    if (outcome.kind === 'keyRejected' || (outcome.kind === 'error' && outcome.detail.startsWith('fără răspuns'))) break;
  }
}

/** Modelele de verificat ale unui furnizor: cele din lista de alegere, apoi rezervele din lanț. */
export function modelsToVerify(provider: ProviderId): AIModel[] {
  const ids = MODEL_OPTIONS[provider].map((option) => option.id);
  return [...ids, ...MODEL_CANDIDATES[provider].filter((id) => !ids.includes(id))];
}

/** Verifică furnizorii cu cheie, unul lângă altul (limitele sunt separate), fiecare secvențial. `only` limitează la un furnizor. */
export async function verifyAllProviders(options: VerifyOptions & { only?: ProviderId } = {}): Promise<void> {
  const targets = PROVIDER_IDS.filter((p) => (options.only ? p === options.only : true)).filter((p) => providerKey(p));
  const results = await Promise.allSettled(targets.map((p) => verifyProvider(p, modelsToVerify(p), providerKey(p), options)));
  const aborted = results.find((r) => r.status === 'rejected' && (r.reason as Error)?.name === 'AbortError');
  if (aborted) throw (aborted as PromiseRejectedResult).reason;
  healRetiredSelection(options.now?.() ?? Date.now());
}

// ---------------------------------------------------------------------------------------------------------------------
// Comutarea automată când modelul ales a fost retras

/**
 * Dacă modelul ales la un furnizor e confirmat retras pentru cheia lui, trece pe primul model din lista de alegere care nu e
 * retras și nu e în pauză, salvează alegerea și spune clar ce s-a întâmplat. Întoarce câte alegeri a schimbat.
 */
export function healRetiredSelection(now = Date.now()): number {
  const state = useAIStore.getState();
  let changed = 0;
  for (const provider of PROVIDER_IDS) {
    const key = providerKey(provider);
    if (!key) continue;
    const selected = provider === state.provider ? state.model : state.providerModels[provider];
    if (!selected || getModelStatus(provider, selected, key, now).kind !== 'retired') continue;

    const options = MODEL_OPTIONS[provider].map((o) => o.id).filter((id) => id !== selected);
    const rank = (id: AIModel) => {
      const status = getModelStatus(provider, id, key, now).kind;
      return status === 'ok' ? 0 : status === 'unknown' || status === 'rate' ? 1 : -1;
    };
    const ordered = [...MODEL_CANDIDATES[provider], ...options].filter((id, i, all) => all.indexOf(id) === i && options.includes(id));
    const pick = ordered.map((id) => ({ id, r: rank(id) })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r)[0]?.id;
    if (!pick) continue;

    if (provider === state.provider) useAIStore.getState().setModel(pick);
    else useAIStore.getState().setProviderModel(provider, pick);
    useToastStore.getState().addToast(modelSwitchMessage(selected, pick, providerDisplayName(provider)), 'info', 7000);
    changed += 1;
  }
  return changed;
}
