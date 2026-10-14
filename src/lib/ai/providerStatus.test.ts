import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIStore } from '../../store/aiStore';
import { useToastStore } from '../../store/toastStore';
import { buildProviderChain } from '../groqCore/providers';
import { noteModelFailure, resetQuotaGuard } from '../groqCore/quotaGuard';
import {
  classifyProbe, discoverChatModels, filterChatModels, getDiscoveredModels, getModelStatus, healRetiredSelection,
  isModelSelectable, keyFingerprint, markModelRetired, probeModel, verifyProvider, MISTRAL_SPACING_MS,
} from './providerStatus';
import { describeStatus, formatClock } from './providerStatusText';

const KEY = 'AIzaFictiveKey-0123456789abcdef';
const MKEY = 'mistral-fictive-key-0123456789';

function reply(status: number, body: unknown = '', headers: Record<string, string> = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(status === 204 ? null : text, { status, headers });
}

beforeEach(() => {
  localStorage.clear();
  resetQuotaGuard();
  useToastStore.setState({ toasts: [] } as never);
  useAIStore.setState({
    provider: 'google', model: 'gemini-3.8-flash', apiKey: KEY,
    providerKeys: { google: KEY }, providerModels: {},
  } as never);
});

describe('classifyProbe', () => {
  it('reads success, retired, auth and server errors', () => {
    expect(classifyProbe(200, '').kind).toBe('ok');
    expect(classifyProbe(404, 'no longer available to new users').kind).toBe('retired');
    expect(classifyProbe(400, 'The model `x` does not exist or you do not have access to it.').kind).toBe('retired');
    expect(classifyProbe(401, 'Unauthorized').kind).toBe('keyRejected');
    expect(classifyProbe(400, 'API key not valid. Please pass a valid API key.').kind).toBe('keyRejected');
    expect(classifyProbe(503, 'Service Unavailable').kind).toBe('error');
  });

  it('tells a per-minute rate limit from a daily quota', () => {
    expect(classifyProbe(429, 'Rate limit exceeded', '2')).toEqual({ kind: 'rate', waitSeconds: 2 });
    expect(classifyProbe(429, 'Quota exceeded for metric generate_content_free_tier_requests, limit: 20, PerDay').kind).toBe('quota');
    expect(classifyProbe(429, '{"error":{"details":[{"retryDelay":"34s"}]}} RESOURCE_EXHAUSTED')).toEqual({ kind: 'rate', waitSeconds: 34 });
    expect(classifyProbe(429, 'rate limit. Please try again in 5h12m.').kind).toBe('quota');
  });
});

describe('probeModel', () => {
  it('sends one token and stores the outcome tied to the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, { ok: true }));
    const outcome = await probeModel('google', 'gemini-3.8-flash', KEY, { fetchImpl, now: () => 1000 });
    expect(outcome.kind).toBe('ok');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('generativelanguage');
    expect(JSON.parse(String(init.body)).max_tokens).toBe(1);
    expect(getModelStatus('google', 'gemini-3.8-flash', KEY, 2000)).toEqual({ kind: 'ok', at: 1000 });
    // altă cheie: verificarea veche nu mai contează
    expect(getModelStatus('google', 'gemini-3.8-flash', 'AIzaAltaCheie-0123456789abcdefgh', 2000).kind).toBe('unknown');
  });

  it('records a 404 as retired and a daily 429 as quota that the guard also knows', async () => {
    const retired = vi.fn().mockResolvedValue(reply(404, 'models/gemini-3.1-pro-preview is no longer available'));
    await probeModel('google', 'gemini-3.1-pro-preview', KEY, { fetchImpl: retired, now: () => 5000 });
    expect(getModelStatus('google', 'gemini-3.1-pro-preview', KEY, 6000).kind).toBe('retired');

    const quota = vi.fn().mockResolvedValue(reply(429, 'Quota exceeded ... PerDay RESOURCE_EXHAUSTED'));
    const now = Date.now();
    await probeModel('google', 'gemini-3.8-flash', KEY, { fetchImpl: quota, now: () => now });
    const st = getModelStatus('google', 'gemini-3.8-flash', KEY, now + 1000);
    expect(st.kind).toBe('quota');
    if (st.kind === 'quota') expect(st.until).toBeGreaterThan(now + 3600_000);
  });

  it('shows a short 429 as a rate limit with a countdown', async () => {
    const now = Date.now();
    const fetchImpl = vi.fn().mockResolvedValue(reply(429, 'Rate limit exceeded', { 'retry-after': '3' }));
    await probeModel('mistral', 'mistral-small-latest', MKEY, { fetchImpl, now: () => now });
    const st = getModelStatus('mistral', 'mistral-small-latest', MKEY, now + 1000);
    expect(st.kind).toBe('rate');
    if (st.kind === 'rate') expect(st.retryInSeconds).toBeLessThanOrEqual(3);
    expect(getModelStatus('mistral', 'mistral-small-latest', MKEY, now + 400_000).kind).toBe('unknown');
  });

  it('marks every model of a provider as key rejected after a 401', async () => {
    await probeModel('groq', 'openai/gpt-oss-120b', 'gsk_fictive_key_0123456789', { fetchImpl: vi.fn().mockResolvedValue(reply(401, 'Invalid API Key')) });
    expect(getModelStatus('groq', 'openai/gpt-oss-20b', 'gsk_fictive_key_0123456789', Date.now()).kind).toBe('keyRejected');
  });

  it('treats a network failure as no answer, not as retired', async () => {
    const outcome = await probeModel('google', 'gemini-3.8-flash', KEY, { fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    expect(outcome.kind).toBe('error');
    expect(isModelSelectable(getModelStatus('google', 'gemini-3.8-flash', KEY, Date.now()))).toBe(true);
  });
});

describe('getModelStatus', () => {
  it('prefers the quota pause from real traffic', () => {
    const now = Date.now();
    noteModelFailure('google', 'gemini-3.8-flash', 'Quota exceeded PerDay RESOURCE_EXHAUSTED 429', now);
    expect(getModelStatus('google', 'gemini-3.8-flash', KEY, now + 1000).kind).toBe('quota');
  });

  it('is unknown without a key and ignores a retired mark older than two weeks', () => {
    expect(getModelStatus('google', 'gemini-3.8-flash', '', 1).kind).toBe('unknown');
    markModelRetired('google', 'gemini-3.8-flash', KEY, 1000);
    expect(getModelStatus('google', 'gemini-3.8-flash', KEY, 1000 + 15 * 86_400_000).kind).toBe('unknown');
    expect(keyFingerprint(KEY)).not.toContain(KEY.slice(0, 8));
  });
});

describe('verifyProvider', () => {
  it('pings Mistral one at a time, 1.1 s apart, after listing its models', async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      times.push(Date.now());
      return url.endsWith('/models') ? reply(200, { data: [{ id: 'mistral-small-latest', capabilities: { completion_chat: true } }] }) : reply(200, {});
    }) as unknown as typeof fetch;
    const done = verifyProvider('mistral', ['mistral-small-latest', 'mistral-large-latest'], MKEY, { fetchImpl });
    await vi.advanceTimersByTimeAsync(MISTRAL_SPACING_MS * 4);
    await done;
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(MISTRAL_SPACING_MS);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(MISTRAL_SPACING_MS);
    vi.useRealTimers();
  });

  it('can be cancelled between pings', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => reply(200, {})) as unknown as typeof fetch;
    const done = verifyProvider('mistral', ['mistral-small-latest', 'mistral-large-latest'], MKEY, { fetchImpl, signal: controller.signal });
    const settled = expect(done).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.advanceTimersByTimeAsync(MISTRAL_SPACING_MS);
    await settled;
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(3);
    vi.useRealTimers();
  });

  it('stops at the first rejected key and skips models whose daily quota is spent', async () => {
    const rejecting = vi.fn().mockResolvedValue(reply(401, 'Invalid API Key'));
    await verifyProvider('groq', ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], 'gsk_fictive_key_0123456789', { fetchImpl: rejecting });
    expect(rejecting).toHaveBeenCalledTimes(1);

    noteModelFailure('google', 'gemini-3.8-flash', 'Quota exceeded PerDay RESOURCE_EXHAUSTED 429');
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, {}));
    await verifyProvider('google', ['gemini-3.8-flash', 'gemini-3.6-flash'], KEY, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)).model).toBe('gemini-3.6-flash');
  });
});

describe('model discovery', () => {
  const sample = {
    data: [
      { id: 'mistral-small-latest', capabilities: { completion_chat: true } },
      { id: 'mistral-embed', capabilities: { completion_chat: false } },
      { id: 'mistral-moderation-latest', capabilities: { completion_chat: true } },
      { id: 'mistral-ocr-latest' },
      { id: 'mistral-large-latest', capabilities: { completion_chat: true } },
      { id: 'mistral-large-latest', capabilities: { completion_chat: true } },
      { id: 'codestral-latest', capabilities: { completion_chat: true } },
    ],
  };

  it('keeps only chat models, without duplicates', () => {
    expect(filterChatModels(sample).map((m) => m.id)).toEqual(['codestral-latest', 'mistral-large-latest', 'mistral-small-latest']);
    expect(filterChatModels(null)).toEqual([]);
  });

  it('stores what the key reports and returns null when the list is refused', async () => {
    const models = await discoverChatModels('mistral', MKEY, { fetchImpl: vi.fn().mockResolvedValue(reply(200, sample)) });
    expect(models?.length).toBe(3);
    expect(getDiscoveredModels('mistral', MKEY).map((m) => m.id)).toContain('codestral-latest');
    expect(getDiscoveredModels('mistral', 'alta-cheie-0123456789abcdef')).toEqual([]);
    expect(await discoverChatModels('mistral', MKEY, { fetchImpl: vi.fn().mockResolvedValue(reply(401, 'no')) })).toBeNull();
  });
});

describe('healRetiredSelection', () => {
  it('switches a retired choice to a working model and says which one', () => {
    useAIStore.setState({ model: 'gemini-3.1-pro-preview' } as never);
    markModelRetired('google', 'gemini-3.1-pro-preview', KEY);
    expect(healRetiredSelection()).toBe(1);
    expect(useAIStore.getState().model).toBe('gemini-3.8-flash');
    const toasts = useToastStore.getState().toasts;
    expect(toasts.at(-1)?.message).toBe('Gemini 3.1 Pro nu mai e disponibil pentru cheia ta (Google Gemini); folosesc Gemini 3.8 Flash.');
  });

  it('skips retired and spent replacements, and leaves a healthy choice alone', () => {
    useAIStore.setState({ model: 'gemini-3.1-pro-preview' } as never);
    markModelRetired('google', 'gemini-3.1-pro-preview', KEY);
    markModelRetired('google', 'gemini-3.8-flash', KEY);
    noteModelFailure('google', 'gemini-4-argon', 'Quota exceeded PerDay RESOURCE_EXHAUSTED 429');
    healRetiredSelection();
    expect(useAIStore.getState().model).toBe('gemini-3.6-flash');
    expect(healRetiredSelection()).toBe(0);
  });

  it('fixes an inactive provider through its saved model', () => {
    useAIStore.setState({ provider: 'groq', model: 'openai/gpt-oss-120b', apiKey: 'gsk_fictive_key_0123456789', providerKeys: { google: KEY, groq: 'gsk_fictive_key_0123456789' }, providerModels: { google: 'gemini-3.1-pro-preview' } } as never);
    markModelRetired('google', 'gemini-3.1-pro-preview', KEY);
    healRetiredSelection();
    expect(useAIStore.getState().providerModels.google).toBe('gemini-3.8-flash');
    expect(useAIStore.getState().model).toBe('openai/gpt-oss-120b');
  });
});

describe('Mistral aliases are safe when a ping gives 404', () => {
  it('does not change the choice, and the request chain still reaches the other providers', async () => {
    useAIStore.setState({ provider: 'mistral', model: 'mistral-small-latest', apiKey: MKEY, providerKeys: { mistral: MKEY, groq: 'gsk_fictive_key_0123456789' } } as never);
    const fetchImpl = vi.fn().mockResolvedValue(reply(404, 'Not found: model does not exist'));
    await verifyProvider('mistral', ['mistral-small-latest', 'mistral-large-latest'], MKEY, { fetchImpl, spacingMs: 0 });
    expect(getModelStatus('mistral', 'mistral-small-latest', MKEY, Date.now()).kind).toBe('retired');
    healRetiredSelection();
    // nu există alt model Mistral viu: nu se inventează unul, alegerea rămâne
    expect(useAIStore.getState().model).toBe('mistral-small-latest');
    const chain = buildProviderChain('mistral', 'mistral-small-latest', { mistral: MKEY, groq: 'gsk_fictive_key_0123456789' });
    expect(chain.some((c) => c.provider === 'groq')).toBe(true);
  });
});

describe('describeStatus', () => {
  it('writes the plain Romanian label for every state', () => {
    const now = new Date(2026, 9, 14, 12, 0).getTime();
    expect(describeStatus({ kind: 'ok', at: now }, now)).toMatchObject({ tone: 'ok', label: 'Merge' });
    expect(describeStatus({ kind: 'quota', until: new Date(2026, 9, 14, 18, 40).getTime() }, now).label).toBe('Cotă epuizată până la 18:40');
    expect(describeStatus({ kind: 'quota', until: new Date(2026, 9, 15, 2, 0).getTime() }, now).label).toBe('Cotă epuizată până la mâine 02:00');
    expect(describeStatus({ kind: 'rate', retryInSeconds: 12 }, now).label).toBe('Limită de cereri · încearcă peste 12 s');
    expect(describeStatus({ kind: 'keyRejected' }, now).label).toBe('Cheie respinsă');
    expect(describeStatus({ kind: 'retired' }, now).label).toBe('Retras / indisponibil pentru cheia ta');
    expect(describeStatus({ kind: 'unknown' }, now).label).toBe('Nu e verificat încă');
    expect(formatClock(now, now)).toBe('12:00');
  });
});
