/**
 * Characterization of the groq.ts request core (provider chain, retry/fallback, streaming),
 * pinned before it was split into src/lib/groqCore/. Drives everything through the public façade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GroqModule = typeof import('./groq');
let g: GroqModule;

const KEY = `gsk_${'x'.repeat(40)}`;
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }), { status: 200 });
const err = (status: number, message = 'boom', headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers });
const sse = (texts: string[]) =>
  new Response(`${texts.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}`).join('\n\n')}\n\ndata: [DONE]\n\n`, { status: 200 });

async function drive<T>(promise: Promise<T>, ms = 60_000): Promise<T> {
  const settled = promise.then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.advanceTimersByTimeAsync(ms);
  const result = await settled;
  if ('error' in result) throw result.error;
  return result.value;
}

const urlOf = (f: ReturnType<typeof vi.fn>, i: number) => String(f.mock.calls[i][0]);
const bodyOf = (f: ReturnType<typeof vi.fn>, i: number) => JSON.parse((f.mock.calls[i][1] as RequestInit).body as string) as Record<string, unknown>;
const msgs = [{ role: 'user' as const, content: 'salut' }];

describe('groq core characterization', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  async function setKeys(keys: Record<string, string>, provider: 'groq' | 'google' | 'mistral' = 'groq') {
    const { useAIStore } = await import('../store/aiStore');
    useAIStore.setState({ provider, apiKey: keys[provider] ?? '', providerKeys: keys, hasKey: true, model: 'primary-model' as never });
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    g = await import('./groq');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses only the primary provider and model when it is the only key', async () => {
    await setKeys({ groq: KEY });
    fetchMock.mockImplementation(() => Promise.resolve(ok(' răspuns ')));
    const out = await drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true }));
    expect(out).toBe('răspuns');
    expect(urlOf(fetchMock, 0)).toContain('api.groq.com');
    expect(bodyOf(fetchMock, 0).model).toBe('primary-model');
    expect(bodyOf(fetchMock, 0).temperature).toBe(0.5);
    expect(bodyOf(fetchMock, 0).max_tokens).toBe(2000);
    expect(g.getLastServedModel()).toEqual({ provider: 'groq', model: 'primary-model' as never });
  });

  it('throws the key hint when the primary key is missing', async () => {
    await setKeys({}, 'google');
    await expect(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true })).rejects.toThrow(/Google Gemini nu este configurată/);
  });

  it('retries a 429 on each model (2 attempts, the last model 4) and then reports the error', async () => {
    await setKeys({ groq: KEY });
    fetchMock.mockImplementation(() => Promise.resolve(err(429, 'slow down')));
    await expect(drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true }))).rejects.toThrow('Eroare AI: slow down');
    // Cota e pe model: modelul ales și gpt-oss-120b se încearcă de câte 2 ori și cedează locul următorului (cota lui), iar ultimul, gpt-oss-20b, se încearcă de 4 ori.
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('fails fast (2 attempts) and falls back to the next keyed provider, with its fallback model', async () => {
    await setKeys({ groq: KEY, google: 'AIza-test-key' });
    fetchMock.mockImplementation((url: string) => Promise.resolve(String(url).includes('groq.com') ? err(500, 'down') : ok('de la google')));
    const out = await drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true }));
    expect(out).toBe('de la google');
    const groqCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('groq.com')).length;
    expect(groqCalls).toBe(2);
    const last = fetchMock.mock.calls.length - 1;
    expect(urlOf(fetchMock, last)).toContain('generativelanguage');
    expect(bodyOf(fetchMock, last).model).toBe('gemini-3.8-flash');
    expect(g.getLastServedModel()?.provider).toBe('google');
  });

  it('stays on the fallback provider for the next request (sticky)', async () => {
    await setKeys({ groq: KEY, google: 'AIza-test-key' });
    fetchMock.mockImplementation((url: string) => Promise.resolve(String(url).includes('groq.com') ? err(500, 'down') : ok('g')));
    await drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true }));
    fetchMock.mockClear();
    await drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true }));
    expect(urlOf(fetchMock, 0)).toContain('generativelanguage');
  });

  it('`only` pins the provider/model with no fallback chain', async () => {
    await setKeys({ groq: KEY, google: 'AIza-test-key' });
    fetchMock.mockImplementation(() => Promise.resolve(err(500, 'down')));
    await expect(drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true, only: { provider: 'google', model: 'm-x' } }))).rejects.toThrow('Eroare AI');
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('generativelanguage'))).toBe(true);
    expect(bodyOf(fetchMock, 0).model).toBe('m-x');
    expect(g.getLastServedModel()).toBeNull();
  });

  it('does not retry non-retryable statuses', async () => {
    await setKeys({ groq: KEY });
    fetchMock.mockImplementation(() => Promise.resolve(err(401, 'bad key')));
    await expect(drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true }))).rejects.toThrow('bad key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops response_format once on 400, remembers it, and resets with resetProviderCapabilityMemory', async () => {
    await setKeys({ groq: KEY });
    fetchMock.mockResolvedValueOnce(err(400, 'no response_format')).mockImplementation(() => Promise.resolve(ok('{}')));
    await drive(g.groqRequest({ task: 'questions', messages: msgs, skipLibraryContext: true, jsonMode: true }));
    expect(bodyOf(fetchMock, 0).response_format).toBeDefined();
    expect(bodyOf(fetchMock, 1).response_format).toBeUndefined();
    await drive(g.groqRequest({ task: 'questions', messages: msgs, skipLibraryContext: true, jsonMode: true }));
    expect(bodyOf(fetchMock, 2).response_format).toBeUndefined();
    g.resetProviderCapabilityMemory();
    await drive(g.groqRequest({ task: 'questions', messages: msgs, skipLibraryContext: true, jsonMode: true }));
    expect(bodyOf(fetchMock, 3).response_format).toBeDefined();
  });

  it('streaming: retries a transient 503 on the same provider, then streams', async () => {
    await setKeys({ groq: KEY });
    fetchMock.mockResolvedValueOnce(err(503, 'unavailable')).mockImplementation(() => Promise.resolve(sse(['a', 'b'])));
    const chunks: string[] = [];
    const full = await drive(g.groqStream(msgs, (c) => chunks.push(c), 0.5, undefined, true));
    expect(full).toBe('ab');
    expect(chunks).toEqual(['a', 'b']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('streaming: falls back to the next provider for the initial connection', async () => {
    await setKeys({ groq: KEY, mistral: 'mk-test-key' });
    fetchMock.mockImplementation((url: string) => Promise.resolve(String(url).includes('groq.com') ? err(500, 'down') : sse(['m'])));
    const full = await drive(g.groqStream(msgs, () => {}, 0.5, undefined, true));
    expect(full).toBe('m');
    expect(urlOf(fetchMock, fetchMock.mock.calls.length - 1)).toContain('mistral.ai');
    expect(g.getLastServedModel()).toEqual({ provider: 'mistral', model: 'mistral-small-latest' });
  });

  it('streaming: reports the provider error when every provider fails', async () => {
    await setKeys({ groq: KEY });
    fetchMock.mockImplementation(() => Promise.resolve(err(401, 'nope')));
    await expect(drive(g.groqStream(msgs, () => {}, 0.5, undefined, true))).rejects.toThrow('Eroare Groq API: nope');
  });

  it('validateApiKey maps 401 to a rejection and 429 to a soft success', async () => {
    fetchMock.mockResolvedValueOnce(err(401, 'x'));
    expect(await g.validateApiKey('groq', KEY)).toEqual({ ok: false, error: 'Cheie respinsă de Groq (401). Verifică sau regenerează cheia.' });
    fetchMock.mockResolvedValueOnce(err(429, 'x'));
    expect((await g.validateApiKey('groq', KEY)).ok).toBe(true);
    expect(await g.validateApiKey('groq', '  ')).toEqual({ ok: false, error: 'Cheia este goală.' });
  });

  it('supportsVision is Groq-only', () => {
    expect(g.supportsVision('groq')).toBe(true);
    expect(g.supportsVision('google')).toBe(false);
  });
});
