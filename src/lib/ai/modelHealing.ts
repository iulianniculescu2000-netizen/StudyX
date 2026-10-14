/**
 * Self-healing for provider model IDs.
 *
 * Providers deprecate/decommission models on their own schedule (Groq killed
 * `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on 2026-08-16, with
 * `mixtral-8x7b-32768` gone over a year earlier) — a hardcoded model string
 * quietly goes from "works" to "every request fails" with no warning. Two
 * layers guard against that recurring:
 *
 *  1. Reactive (`isModelUnavailableError` + `nextCandidateModel`, used by
 *     `groqRequest`'s retry loop): when a request fails with a "model doesn't
 *     exist/was decommissioned" style error, immediately retry on the next
 *     known-good candidate for that same provider instead of surfacing the
 *     error, and — if it was the user's configured model — persist the swap
 *     so it's fixed going forward, not just for this one request.
 *  2. Proactive (`checkModelAvailability`, run once/day at startup): asks the
 *     provider's own `/models` list which IDs are currently live and swaps
 *     away from the configured one before the user ever hits an error.
 */
import { useAIStore, type AIModel, type AIProvider } from '../../store/aiStore';
import { useToastStore } from '../../store/toastStore';
import {
  MODEL_CANDIDATES, PROVIDER_NAMES, isModelUnavailableError, modelDisplayName,
  type ProviderId as CatalogProviderId,
} from './modelCatalog';

type ProviderId = CatalogProviderId;

export const MODELS_ENDPOINT: Record<ProviderId, string> = {
  groq: 'https://api.groq.com/openai/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
  mistral: 'https://api.mistral.ai/v1/models',
};

export const CHAT_ENDPOINT: Record<ProviderId, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};

export { isModelUnavailableError };

/** Modelele cunoscute ca funcționale ale unui furnizor, în ordinea preferinței (rezerve când cota unuia e epuizată). */
export function candidateModels(provider: ProviderId): readonly AIModel[] {
  return MODEL_CANDIDATES[provider];
}

/** First candidate for this provider that isn't the one that just failed, or null if there's nothing left to try. */
export function nextCandidateModel(provider: ProviderId, failedModel: string, skip?: (model: AIModel) => boolean): AIModel | null {
  return MODEL_CANDIDATES[provider].find((candidate) => candidate !== failedModel && !skip?.(candidate)) ?? null;
}

/** Mesajul de comutare, cu numele modelelor: „Gemini 3.1 Pro nu mai e disponibil pentru cheia ta (…); folosesc Gemini 3.8 Flash.” */
export function modelSwitchMessage(deadModel: string, workingModel: string, providerName: string): string {
  return `${modelDisplayName(deadModel)} nu mai e disponibil pentru cheia ta (${providerName}); folosesc ${modelDisplayName(workingModel)}.`;
}

/**
 * Called after a reactive swap succeeds. Only persists (and only notifies
 * the user) when the model that died was their own configured default —
 * a fallback-provider's hardcoded model swapping mid-request needs no
 * user-facing change, since `FALLBACK_MODEL` isn't something the user set.
 */
export function healPrimaryModelChoice(
  provider: AIProvider,
  primaryProvider: AIProvider,
  deadModel: string,
  workingModel: AIModel,
  providerName: string,
) {
  if (provider !== primaryProvider) return;
  useAIStore.getState().setModel(workingModel);
  useToastStore.getState().addToast(
    modelSwitchMessage(deadModel, workingModel, providerName),
    'info',
    7000,
  );
}

interface ModelListResponse {
  data?: Array<{ id?: string }>;
}

const LAST_CHECK_KEY = 'studyx-model-health-check';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function isKnownProvider(provider: AIProvider): provider is ProviderId {
  return provider === 'groq' || provider === 'google' || provider === 'mistral';
}

/**
 * Proactive check: asks the active provider which models are currently live
 * and swaps away from the configured one if it's gone — before the user's
 * next request would have failed on it. Throttled to once/day per provider
 * (a hardcoded model doesn't change more often than that, and this is a
 * network call on every app boot otherwise). Fails silently on any network
 * or parsing error — this is a nice-to-have, never something that should
 * block startup or surface as an error of its own.
 */
export async function checkModelAvailability(): Promise<void> {
  const state = useAIStore.getState();
  const { provider, model, apiKey } = state;
  if (!isKnownProvider(provider) || !apiKey.trim()) return;

  const throttleKey = `${LAST_CHECK_KEY}:${provider}`;
  const last = Number(localStorage.getItem(throttleKey) ?? 0);
  if (Date.now() - last < CHECK_INTERVAL_MS) return;

  try {
    const res = await fetch(MODELS_ENDPOINT[provider], {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return; // key issues etc. — the reactive layer + existing key validation cover that
    const body = await res.json() as ModelListResponse;
    // Google listează modelele cu prefix („models/gemini-3.8-flash”): fără normalizare orice model ar părea retras.
    const liveIds = new Set((body.data ?? []).map((entry) => entry.id?.replace(/^models\//, '')).filter((id): id is string => !!id));
    if (liveIds.size === 0) return; // an empty/malformed list is more likely a parsing miss than a truth

    localStorage.setItem(throttleKey, String(Date.now()));
    if (liveIds.has(model)) return;

    const replacement = MODEL_CANDIDATES[provider].find((candidate) => liveIds.has(candidate))
      ?? MODEL_CANDIDATES[provider][0];
    if (replacement === model) return; // nu există un alt model de propus: nu se schimbă nimic și nu se anunță nimic
    healPrimaryModelChoice(provider, provider, model, replacement, providerDisplayName(provider));
  } catch {
    // Offline, timeout, CORS, whatever — silently skip. The reactive layer
    // still catches a genuinely dead model the next time it's actually used.
  }
}

export function providerDisplayName(provider: ProviderId): string {
  return PROVIDER_NAMES[provider];
}

/**
 * A real 1-token chat-completions ping, not a `/models` catalog lookup.
 * Confirmed live (2026-08-24) that a retired Google model can still appear
 * in `/models` long after every actual chat request to it 404s — catalog
 * membership is not proof a model works, only an invocation attempt is.
 */
async function pingModel(provider: ProviderId, model: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(CHAT_ENDPOINT[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      signal: AbortSignal.timeout(10000),
    });
    // 429 only happens after the key/model authenticate — rate-limited, not dead.
    return res.ok || res.status === 429;
  } catch {
    return false;
  }
}

/** First model (current one preferred) that actually answers a real ping, or null if none of them do. */
async function findLiveModel(provider: ProviderId, currentModel: string, apiKey: string): Promise<string | null> {
  if (await pingModel(provider, currentModel, apiKey)) return currentModel;
  for (const candidate of MODEL_CANDIDATES[provider]) {
    if (candidate === currentModel) continue;
    if (await pingModel(provider, candidate, apiKey)) return candidate;
  }
  return null;
}

export interface ProviderModelCheck {
  provider: ProviderId;
  providerName: string;
  hadKey: boolean;
  ok: boolean;
  changed: boolean;
  previousModel: string | null;
  model: string | null;
  message: string;
}

/**
 * On-demand "check for AI updates" — the Settings button. Checks EVERY
 * provider that has a saved key, not just the one currently active, so
 * fixing e.g. Mistral doesn't require switching to it first. Ping-based
 * (not catalog-based) for the reason `pingModel` explains: a provider can
 * keep listing a retired model in `/models` long after it 404s on real use,
 * so only an actual invocation attempt proves a model works.
 *
 * A fix for a provider you're not currently on still needs to survive the
 * next time you DO switch to it — `setProviderModel` persists into
 * `providerModels` regardless of which provider is active, and `setProvider`
 * reads from there first.
 */
export async function refreshAllProviderModels(): Promise<ProviderModelCheck[]> {
  const state = useAIStore.getState();
  const providers: ProviderId[] = ['groq', 'google', 'mistral'];
  const results: ProviderModelCheck[] = [];

  for (const provider of providers) {
    const providerName = providerDisplayName(provider);
    const key = (state.providerKeys[provider] ?? '').trim();

    if (!key) {
      results.push({
        provider, providerName, hadKey: false, ok: false, changed: false,
        previousModel: null, model: null, message: 'Fără cheie configurată.',
      });
      continue;
    }

    const previousModel = provider === state.provider ? state.model : (state.providerModels[provider] ?? MODEL_CANDIDATES[provider][0]);
    const live = await findLiveModel(provider, previousModel, key);

    if (!live) {
      results.push({
        provider, providerName, hadKey: true, ok: false, changed: false,
        previousModel, model: null, message: 'Niciun model nu a răspuns — verifică cheia.',
      });
      continue;
    }

    const changed = live !== previousModel;
    if (changed) {
      useAIStore.getState().setProviderModel(provider, live as AIModel);
    }
    results.push({
      provider, providerName, hadKey: true, ok: true, changed,
      previousModel, model: live,
      message: changed ? `Actualizat automat la ${live}.` : `Deja pe cel mai recent model (${live}).`,
    });
  }

  return results;
}
