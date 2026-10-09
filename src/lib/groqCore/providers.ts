import type { useAIStore } from '../../store/aiStore';
import { useToastStore } from '../../store/toastStore';
import { sanitizeKey } from './keys';
import type { CloudProviderId, ProviderId } from './types';

export function getProviderConfig(provider: ReturnType<typeof useAIStore.getState>['provider']) {
  if (provider === 'google') {
    return {
      name: 'Google Gemini',
      // Google exposes an OpenAI-compatible endpoint, so the same chat-completions
      // request/response shape works with a Bearer API key.
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      keyHint: 'Cheia API Google Gemini nu este configurată. Mergi la Setări AI.',
    };
  }

  if (provider === 'mistral') {
    return {
      name: 'Mistral AI',
      // OpenAI-compatible, ~1B tokens/lună gratis pe tier-ul "Experiment",
      // fără card — CORS confirmat live (access-control-allow-origin: *),
      // spre deosebire de NVIDIA NIM (încercat și scos, vezi istoricul git).
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      keyHint: 'Cheia API Mistral nu este configurată. Mergi la Setări AI.',
    };
  }

  return {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyHint: 'Cheia API Groq nu este configurată. Mergi la Setări AI.',
  };
}

/** Default model to use when we fall back to another provider mid-request. */
export const FALLBACK_MODEL: Record<CloudProviderId, string> = {
  groq: 'openai/gpt-oss-120b',
  google: 'gemini-3.8-flash',
  mistral: 'mistral-small-latest',
};

/** Cloud providers in fallback order. */
export const PROVIDER_ORDER: ProviderId[] = ['groq', 'google', 'mistral'];

/**
 * How long we keep starting requests on a fallback provider after switching away
 * from a rate-limited one, before giving the primary another shot. Without this,
 * every single request would re-hit the still-limited primary first and eat its
 * retry attempts before falling back again.
 */
const FALLBACK_STICKY_MS = 10 * 60 * 1000;

/** In-memory only (per app session) — which provider we're currently "stuck" on. */
let stickyFallback: { provider: ProviderId; primary: ProviderId; until: number } | null = null;

/**
 * Provider chain: the active provider first, then any OTHER provider that has a
 * saved key. When one hits its free-tier limit (or errors), callers transparently
 * continue on the next — so the four free tiers act like one big pool.
 *
 * If we recently switched away from `primaryProvider` due to a failure, requests
 * start on that fallback provider instead (still trying `primaryProvider` later in
 * the chain, in case it already recovered) until FALLBACK_STICKY_MS elapses.
 */
export function buildProviderChain(
  primaryProvider: ProviderId,
  primaryModel: string,
  providerKeys: Partial<Record<ProviderId, string>>,
): Array<{ provider: ProviderId; key: string; model: string; endpoint?: string }> {
  if (stickyFallback && stickyFallback.until <= Date.now()) stickyFallback = null;

  const startProvider =
    stickyFallback &&
    stickyFallback.primary === primaryProvider &&
    sanitizeKey(providerKeys[stickyFallback.provider] ?? '')
      ? stickyFallback.provider
      : primaryProvider;

  const modelFor = (p: ProviderId) => (p === primaryProvider ? primaryModel : FALLBACK_MODEL[p]);
  const ordered = [startProvider, ...PROVIDER_ORDER.filter((p) => p !== startProvider)];

  const chain: Array<{ provider: ProviderId; key: string; model: string; endpoint?: string }> = [];
  for (const p of ordered) {
    const k = sanitizeKey(providerKeys[p] ?? '');
    if (k) chain.push({ provider: p, key: k, model: modelFor(p) });
  }
  return chain;
}

/**
 * Records which provider actually served a request and, when it's a fallback
 * (not the user's configured primary), notifies the user once via toast so
 * they know the app quietly switched — e.g. "Limita Groq atinsă — am trecut
 * automat pe Google Gemini." Clears the sticky state once the primary answers
 * again (it recovered on its own).
 */
export function trackProviderOutcome(provider: ProviderId, primaryProvider: ProviderId, providerName: string, armSticky = true) {
  if (provider === primaryProvider) {
    stickyFallback = null;
    return;
  }
  // A request the primary rejected for its own content (too large, malformed) says nothing about the primary's health.
  if (!armSticky) return;
  const isNewSwitch = !stickyFallback || stickyFallback.provider !== provider;
  // Armed once per switch: extending it on every success would keep the app on the fallback forever.
  if (isNewSwitch) {
    stickyFallback = { provider, primary: primaryProvider, until: Date.now() + FALLBACK_STICKY_MS };
    useToastStore.getState().addToast(
      `Furnizorul curent nu a răspuns (limită sau eroare) — am trecut automat pe ${providerName}.`,
      'info',
      6000,
    );
  }
}

/** Provider/model that served the latest successful request or stream (in memory): lets the chat tag an answer with its producer. */
let lastServed: { provider: CloudProviderId; model: string } | null = null;
export function getLastServedModel(): { provider: CloudProviderId; model: string } | null {
  return lastServed;
}
export function markServed(provider: ProviderId, model: string): void {
  lastServed = { provider, model };
}
