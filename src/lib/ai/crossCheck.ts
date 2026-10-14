/**
 * "Verifică cu alt model": a different provider/model independently checks an AI answer.
 *
 * Pure parts (verifier choice, prompt, verdict, parsing) are exported for tests;
 * `runCrossCheck` ties them to the AI layer. It never runs on its own — the UI calls it on a click —
 * and it is pinned to the chosen verifier (`only`): a silent fallback to the producer would make the
 * "second opinion" worthless. Keys never leave groqRequest; nothing here reads or returns them.
 */
import { z } from 'zod';
import { useAIStore, getConfiguredProviderModels, type AIProvider } from '../../store/aiStore';
import { useAIUsageStore } from '../../store/aiUsageStore';
import { providerName } from './providerCatalog';
import { VERIFIER_MATERIAL_RULE } from '../../ai/promptKit';
import { looksLikeJson, parseJsonLoose } from '../jsonExtract';
import { friendlyAIError } from './friendlyError';
import type { RateWindow } from './rateHeaders';

export type ClaimStatus = 'confirmat' | 'discutabil' | 'greșit';
export type CrossCheckVerdict = 'verificat' | 'atentie' | 'contrazis';

export interface CrossCheckClaim {
  claim: string;
  status: ClaimStatus;
  reason: string;
  /** false = the sources were given and do not contain it; undefined = no sources / not stated. */
  inSource?: boolean;
}

export interface CrossCheckResult {
  verdict: CrossCheckVerdict;
  claims: CrossCheckClaim[];
  summary?: string;
}

export interface ModelRef { provider: AIProvider; model: string }

export interface VerifierSource { label: string; text: string }

export interface CrossCheckInput {
  question: string;
  answer: string;
  sources?: VerifierSource[];
  /** Who wrote the answer; undefined → whoever served the latest request is assumed; null → not written by an AI (e.g. a bank explanation). */
  producer?: ModelRef | null;
  abortSignal?: AbortSignal;
}

export type CrossCheckOutcome =
  | { ok: true; result: CrossCheckResult; verifier: ModelRef; tokens: number; estimated: boolean }
  | { ok: false; error: string; verifier?: ModelRef };

export const ANSWER_LIMIT = 6000;
export const SOURCE_LIMIT = 900;
export const MAX_SOURCES = 6;

// ── Verifier choice ──────────────────────────────────────────────────────────

/** A window that reports nothing left and has not reset yet. */
export function isLikelyLimited(window: RateWindow | undefined, now = Date.now()): boolean {
  if (!window) return false;
  const exhausted = (window.remainingRequests !== undefined && window.remainingRequests <= 0)
    || (window.remainingTokens !== undefined && window.remainingTokens <= 0);
  if (!exhausted) return false;
  const resetIn = Math.max(window.resetRequestsIn ?? 0, window.resetTokensIn ?? 0);
  return window.at + resetIn * 1000 > now;
}

/**
 * The verifier is a configured provider DIFFERENT from the producer. Providers that just reported
 * an exhausted limit are skipped when another one is available. Null when no other provider has a key.
 */
export function pickVerifier(
  producer: ModelRef | null | undefined,
  configured: ModelRef[],
  windows: Partial<Record<AIProvider, RateWindow>> = {},
  now = Date.now(),
): ModelRef | null {
  const others = configured.filter((entry) => !producer || entry.provider !== producer.provider);
  if (others.length === 0) return null;
  return others.find((entry) => !isLikelyLimited(windows[entry.provider], now)) ?? others[0];
}

/** True when a second provider is configured (the feature's availability rule). */
export function canCrossCheck(configured: ModelRef[]): boolean {
  return new Set(configured.map((entry) => entry.provider)).size >= 2;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

export function buildVerifierMessages(input: Pick<CrossCheckInput, 'question' | 'answer' | 'sources'>) {
  const sources = (input.sources ?? []).filter((source) => source.text.trim()).slice(0, MAX_SOURCES);
  const system = [
    'Ești un verificator medical riguros. Primești o întrebare, un răspuns scris de alt model AI și, uneori, fragmente-sursă.',
    VERIFIER_MATERIAL_RULE,
    'Sarcină: extrage afirmațiile factuale importante din răspuns (maximum 8) și evaluează fiecare independent.',
    'Pentru fiecare afirmație alege statusul: "confirmat", "discutabil" sau "greșit", cu un motiv de o singură propoziție scurtă.',
    sources.length > 0
      ? 'Sursele sunt cele pe care s-a bazat răspunsul: pune "inSource": true dacă afirmația apare în ele, altfel false iar motivul începe cu „în sursă nu apare”.'
      : 'Nu există surse: omite câmpul "inSource".',
    'Nu inventa informații, cifre sau referințe. Dacă nu ești sigur, folosește "discutabil", nu "confirmat".',
    'Scrie în română. Răspunde DOAR cu JSON valid, fără markdown:',
    '{"claims":[{"claim":"...","status":"confirmat|discutabil|greșit","reason":"...","inSource":true}],"summary":"o propoziție"}',
  ].join('\n');
  const parts = [
    `ÎNTREBARE:\n${clip(input.question.trim(), 1500)}`,
    `RĂSPUNS DE VERIFICAT:\n${clip(input.answer.trim(), ANSWER_LIMIT)}`,
  ];
  if (sources.length > 0) {
    parts.push(`SURSE:\n${sources.map((source, index) => `[${index + 1}] ${source.label}\n${clip(source.text.trim(), SOURCE_LIMIT)}`).join('\n\n')}`);
  }
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: parts.join('\n\n') },
  ];
}

// ── Parsing / verdict ────────────────────────────────────────────────────────

const strip = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function normalizeStatus(value: unknown): ClaimStatus | null {
  if (typeof value !== 'string') return null;
  const v = strip(value);
  if (/^(confirmat|confirmed|corect|correct|adevarat|true|ok)/.test(v)) return 'confirmat';
  if (/^(discutabil|disputed|partial|nesigur|incert|unclear|uncertain|dubios)/.test(v)) return 'discutabil';
  if (/^(gresit|incorect|incorrect|wrong|fals|false|contrazis)/.test(v)) return 'greșit';
  return null;
}

const ClaimSchema = z.object({
  claim: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1, 'afirmație goală')),
  status: z.preprocess(normalizeStatus, z.enum(['confirmat', 'discutabil', 'greșit'], { error: 'status necunoscut' })),
  reason: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string()),
  inSource: z.preprocess((v) => (typeof v === 'boolean' ? v : undefined), z.boolean().optional()),
});

const VerifierReplySchema = z.preprocess(
  (value) => (Array.isArray(value) ? { claims: value } : value),
  z.object({
    claims: z.array(z.unknown()),
    summary: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined), z.string().optional()),
  }).transform((reply, ctx) => {
    // An unusable claim is dropped alone; the verdict only fails when nothing usable is left.
    const claims: CrossCheckClaim[] = [];
    for (const raw of reply.claims) {
      const parsed = ClaimSchema.safeParse(raw);
      if (parsed.success) claims.push(parsed.data);
    }
    if (claims.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'nicio afirmație validă în răspunsul verificatorului' });
      return z.NEVER;
    }
    return { claims: claims.slice(0, 12), summary: reply.summary };
  }),
);

export function computeVerdict(claims: CrossCheckClaim[]): CrossCheckVerdict {
  if (claims.some((claim) => claim.status === 'greșit')) return 'contrazis';
  if (claims.some((claim) => claim.status === 'discutabil')) return 'atentie';
  return 'verificat';
}

export const VERDICT_LABEL: Record<CrossCheckVerdict, string> = {
  verificat: 'Verificat',
  atentie: 'Atenție',
  contrazis: 'Contrazis',
};

/** Validate a raw verifier reply (no network): `ok:false` on malformed output. */
export function parseVerifierReply(raw: unknown): { ok: true; result: CrossCheckResult } | { ok: false; error: string } {
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) return { ok: false, error: 'răspuns gol' };
  const loose = parseJsonLoose(text);
  if (!loose) return { ok: false, error: looksLikeJson(text) ? 'JSON invalid' : 'răspunsul nu conține JSON' };
  const parsed = CrossCheckSchema.safeParse(loose.value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'format neașteptat' };
  return { ok: true, result: { verdict: computeVerdict(parsed.data.claims), claims: parsed.data.claims, summary: parsed.data.summary } };
}

export const CrossCheckSchema = VerifierReplySchema as unknown as z.ZodType<{ claims: CrossCheckClaim[]; summary?: string }>;

// ── Orchestration ────────────────────────────────────────────────────────────

const todayTokens = (provider: AIProvider): number => {
  const days = useAIUsageStore.getState().days;
  const latest = Object.keys(days).sort().pop();
  return latest ? days[latest]?.[provider]?.tokens ?? 0 : 0;
};

/** Producer to assume when a message carries none: whoever served the latest request, else the active provider. */
export async function assumedProducer(): Promise<ModelRef> {
  // groq.ts is loaded lazily so this module stays light for the chat bundle.
  const { getLastServedModel } = await import('../groq');
  const served = getLastServedModel();
  if (served) return { provider: served.provider, model: served.model };
  const state = useAIStore.getState();
  return { provider: state.provider, model: state.model };
}

export async function runCrossCheck(input: CrossCheckInput): Promise<CrossCheckOutcome> {
  const state = useAIStore.getState();
  const configured = getConfiguredProviderModels(state);
  const verifier = pickVerifier(input.producer === undefined ? await assumedProducer() : input.producer, configured, useAIUsageStore.getState().windows);
  if (!verifier) return { ok: false, error: 'Adaugă încă o cheie ca să verifici.' };

  const before = todayTokens(verifier.provider);
  try {
    const { requestStructured } = await import('./structured');
    const reply = await requestStructured({
      schema: CrossCheckSchema,
      messages: buildVerifierMessages(input),
      task: 'analysis',
      temperature: 0.1,
      maxTokens: 1400,
      abortSignal: input.abortSignal,
      only: verifier,
      label: 'crossCheck',
      schemaHint: '{"claims":[{"claim":string,"status":"confirmat"|"discutabil"|"greșit","reason":string,"inSource"?:boolean}],"summary"?:string}',
    });
    const spent = Math.max(0, todayTokens(verifier.provider) - before);
    if (!reply.ok) return { ok: false, error: 'Verificatorul nu a returnat un rezultat valid. Încearcă din nou.', verifier };
    const { claims, summary } = reply.data;
    const days = useAIUsageStore.getState().days;
    const estimated = days[Object.keys(days).sort().pop() ?? '']?.[verifier.provider]?.estimated ?? true;
    return { ok: true, result: { verdict: computeVerdict(claims), claims, summary }, verifier, tokens: spent, estimated };
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) throw error;
    return { ok: false, error: friendlyAIError(error), verifier };
  }
}

export const verifierLabel = (ref: ModelRef) => `${providerName(ref.provider)} · ${ref.model}`;
