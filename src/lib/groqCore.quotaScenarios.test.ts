/**
 * Scenarii reale de epuizare a cotelor gratuite: câte cereri se pierd, pe ce model/furnizor ajunge răspunsul și dacă cererea
 * următoare mai lovește degeaba un model epuizat. Răspunsurile false imită mesajele reale ale Gemini, Groq și Mistral.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GroqModule = typeof import('./groq');
let g: GroqModule;

const GROQ_KEY = `gsk_${'x'.repeat(40)}`;
const GOOGLE_KEY = 'AIza-test-key-for-scenarios-000000';
const MISTRAL_KEY = 'mistral-test-key-for-scenarios-0000';

const ok = (content = 'ok') => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }), { status: 200 });
const fail = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers });

const GEMINI_DAILY = 'You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash Please retry in 6h38m42s. [RESOURCE_EXHAUSTED, GenerateRequestsPerDayPerProjectPerModel-FreeTier]';
const GROQ_TPD = 'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199900, Requested 500. Please try again in 8m24s.';
const GROQ_TOO_BIG = 'Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 9500, please reduce your message size and try again.';

async function drive<T>(promise: Promise<T>, ms = 60_000): Promise<T> {
  const settled = promise.then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.advanceTimersByTimeAsync(ms);
  const result = await settled;
  if ('error' in result) throw result.error;
  return result.value;
}

const providerOf = (url: string) => (url.includes('groq.com') ? 'groq' : url.includes('generativelanguage') ? 'google' : 'mistral');
const modelOf = (call: unknown[]) => (JSON.parse((call[1] as RequestInit).body as string) as { model: string }).model;
/** Cererile trimise, ca „furnizor:model”, în ordine. */
const sent = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map((call) => `${providerOf(String(call[0]))}:${modelOf(call)}`);

const msgs = [{ role: 'user' as const, content: 'salut' }];

describe('epuizarea cotelor gratuite', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  async function setup(primary: 'groq' | 'google' | 'mistral', model: string) {
    const { useAIStore } = await import('../store/aiStore');
    const keys = { groq: GROQ_KEY, google: GOOGLE_KEY, mistral: MISTRAL_KEY };
    useAIStore.setState({ provider: primary, apiKey: keys[primary], providerKeys: keys, hasKey: true, model: model as never });
  }
  const ask = () => drive(g.groqRequest({ task: 'chat', messages: msgs, skipLibraryContext: true }));

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    localStorage.clear();
    g = await import('./groq');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('Gemini 3.8 cu cota zilnică epuizată: o singură cerere pierdută, apoi niciuna', async () => {
    await setup('google', 'gemini-3.8-flash');
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const model = (JSON.parse(init.body as string) as { model: string }).model;
      return Promise.resolve(model === 'gemini-3.8-flash' ? fail(429, GEMINI_DAILY) : ok(`de la ${model}`));
    });
    expect(await ask()).toBe('de la gemini-4-argon');
    expect(sent(fetchMock)).toEqual(['google:gemini-3.8-flash', 'google:gemini-4-argon']);

    fetchMock.mockClear();
    expect(await ask()).toBe('de la gemini-4-argon');
    expect(sent(fetchMock)).toEqual(['google:gemini-4-argon']);
  });

  it('toate modelele Gemini epuizate: fiecare se încearcă o singură dată, apoi cererile merg direct pe Groq', async () => {
    await setup('google', 'gemini-3.8-flash');
    fetchMock.mockImplementation((url: string) => Promise.resolve(String(url).includes('generativelanguage') ? fail(429, GEMINI_DAILY) : ok('de la groq')));
    expect(await ask()).toBe('de la groq');
    const googleCalls = sent(fetchMock).filter((entry) => entry.startsWith('google:'));
    expect(googleCalls).toHaveLength(new Set(googleCalls).size);
    expect(sent(fetchMock).at(-1)).toBe('groq:openai/gpt-oss-120b');

    fetchMock.mockClear();
    expect(await ask()).toBe('de la groq');
    expect(sent(fetchMock)).toEqual(['groq:openai/gpt-oss-120b']);
  });

  it('Groq cu cota zilnică de tokeni epuizată: trece pe gpt-oss-20b, apoi nu mai lovește 120B până la reset', async () => {
    await setup('groq', 'openai/gpt-oss-120b');
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const model = (JSON.parse(init.body as string) as { model: string }).model;
      return Promise.resolve(model === 'openai/gpt-oss-120b' ? fail(429, GROQ_TPD, { 'retry-after': '504' }) : ok(`de la ${model}`));
    });
    expect(await ask()).toBe('de la openai/gpt-oss-20b');
    expect(sent(fetchMock)).toEqual(['groq:openai/gpt-oss-120b', 'groq:openai/gpt-oss-20b']);

    fetchMock.mockClear();
    await ask();
    expect(sent(fetchMock)).toEqual(['groq:openai/gpt-oss-20b']);

    // După resetul declarat (8m24s) modelul mare revine în joc.
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    await ask();
    expect(sent(fetchMock)[0]).toBe('groq:openai/gpt-oss-120b');
  });

  it('o cerere prea mare pentru limita pe minut nu pune modelul în pauză și nu încearcă degeaba alt model Groq', async () => {
    await setup('groq', 'openai/gpt-oss-120b');
    fetchMock.mockImplementation((url: string) => Promise.resolve(String(url).includes('groq.com') ? fail(413, GROQ_TOO_BIG) : ok('de la google')));
    expect(await ask()).toBe('de la google');
    // O singură încercare pe Groq: gpt-oss-20b ar da aceeași eroare (aceeași limită pe minut).
    expect(sent(fetchMock).filter((entry) => entry.startsWith('groq:'))).toEqual(['groq:openai/gpt-oss-120b']);

    // Cererea următoare, mică, își găsește modelul liber (nu a fost pus în pauză din cauza celei mari).
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => Promise.resolve(ok('de la groq')));
    await ask();
    expect(sent(fetchMock)).toEqual(['groq:openai/gpt-oss-120b']);
  });

  it('aceeași cerere prea mare, dar raportată de Groq ca 429 „Rate limit reached”: tot nu pune modelul în pauză', async () => {
    await setup('groq', 'openai/gpt-oss-120b');
    const tooBig429 = 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 0, Requested 9500. Please try again in 1.2s.';
    fetchMock.mockImplementation((url: string) => Promise.resolve(String(url).includes('groq.com') ? fail(429, tooBig429) : ok('de la google')));
    expect(await ask()).toBe('de la google');
    expect(sent(fetchMock).filter((entry) => entry.startsWith('groq:')).length).toBeLessThanOrEqual(2);

    fetchMock.mockClear();
    fetchMock.mockImplementation(() => Promise.resolve(ok('de la groq')));
    await ask();
    expect(sent(fetchMock)).toEqual(['groq:openai/gpt-oss-120b']);
  });

  it('cheie respinsă (401): o singură cerere pe furnizorul respectiv, apoi următorul furnizor', async () => {
    await setup('google', 'gemini-3.8-flash');
    fetchMock.mockImplementation((url: string) => Promise.resolve(String(url).includes('generativelanguage') ? fail(401, 'API key not valid') : ok('de la groq')));
    expect(await ask()).toBe('de la groq');
    expect(sent(fetchMock)).toEqual(['google:gemini-3.8-flash', 'groq:openai/gpt-oss-120b']);
  });

  it('pauzele supraviețuiesc repornirii aplicației: cota zilnică nu se mai lovește la prima cerere de după pornire', async () => {
    await setup('google', 'gemini-3.8-flash');
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const model = (JSON.parse(init.body as string) as { model: string }).model;
      return Promise.resolve(model === 'gemini-3.8-flash' ? fail(429, GEMINI_DAILY) : ok(`de la ${model}`));
    });
    await ask();

    // Repornire: modulele se reîncarcă, localStorage rămâne.
    vi.resetModules();
    g = await import('./groq');
    await setup('google', 'gemini-3.8-flash');
    fetchMock.mockClear();
    await ask();
    expect(sent(fetchMock)).toEqual(['google:gemini-4-argon']);
  });
});
