import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildVerifierMessages, canCrossCheck, computeVerdict, isLikelyLimited, parseVerifierReply, pickVerifier, ANSWER_LIMIT,
  type ModelRef,
} from './crossCheck';

const G: ModelRef = { provider: 'groq', model: 'openai/gpt-oss-120b' };
const GM: ModelRef = { provider: 'google', model: 'gemini-3.8-flash' };
const C: ModelRef = { provider: 'mistral', model: 'mistral-small-latest' };

describe('provider selection', () => {
  it('needs two distinct providers', () => {
    expect(canCrossCheck([G])).toBe(false);
    expect(canCrossCheck([G, GM])).toBe(true);
    expect(canCrossCheck([])).toBe(false);
  });
  it('picks a provider different from the producer', () => {
    expect(pickVerifier(G, [G, GM, C])).toEqual(GM);
    expect(pickVerifier(GM, [G, GM, C])).toEqual(G);
  });
  it('returns null when only the producer is configured', () => {
    expect(pickVerifier(G, [G])).toBeNull();
  });
  it('skips a provider whose window is exhausted, unless it is the only one', () => {
    const now = 1_000_000;
    const windows = { google: { remainingRequests: 0, resetRequestsIn: 60, at: now } };
    expect(pickVerifier(G, [G, GM, C], windows, now)).toEqual(C);
    expect(pickVerifier(G, [G, GM], windows, now)).toEqual(GM);
    expect(isLikelyLimited(windows.google, now + 61_000)).toBe(false);
  });
});

describe('prompt builder', () => {
  it('includes question, answer and numbered sources, in Romanian with the three statuses', () => {
    const [system, user] = buildVerifierMessages({ question: 'Q?', answer: 'A.', sources: [{ label: 'Kumar p.1', text: 'text sursa' }] });
    expect(system.content).toMatch(/confirmat.*discutabil.*greșit/);
    expect(system.content).toContain('în sursă nu apare');
    expect(user.content).toContain('ÎNTREBARE:\nQ?');
    expect(user.content).toContain('[1] Kumar p.1');
  });
  it('omits the sources block and inSource when there are none, and clips long answers', () => {
    const [system, user] = buildVerifierMessages({ question: 'Q', answer: 'x'.repeat(ANSWER_LIMIT * 2) });
    expect(user.content).not.toContain('SURSE:');
    expect(system.content).toContain('Nu există surse');
    expect(user.content.length).toBeLessThan(ANSWER_LIMIT + 400);
  });
});

describe('parsing', () => {
  const good = JSON.stringify({ claims: [
    { claim: 'a', status: 'confirmat', reason: 'ok', inSource: true },
    { claim: 'b', status: 'Discutabil', reason: 'în sursă nu apare', inSource: false },
  ], summary: 'Mostly fine' });
  it('parses and derives the verdict', () => {
    const r = parseVerifierReply(good);
    expect(r.ok && r.result.verdict).toBe('atentie');
    expect(r.ok && r.result.claims[1].inSource).toBe(false);
  });
  it('accepts fences, bare arrays and diacritic-less statuses', () => {
    const r = parseVerifierReply('```json\n[{"claim":"x","status":"gresit","reason":"r"}]\n```');
    expect(r.ok && r.result.verdict).toBe('contrazis');
  });
  it('drops a bad claim but fails when none is usable', () => {
    const mixed = parseVerifierReply(JSON.stringify({ claims: [{ claim: 'x', status: '???' }, { claim: 'y', status: 'confirmat' }] }));
    expect(mixed.ok && mixed.result.claims).toHaveLength(1);
    expect(parseVerifierReply('{"claims":[{"claim":"x","status":"?"}]}').ok).toBe(false);
  });
  it.each(['', 'nu pot verifica', '{"claims": [', '{"claims": "nope"}', '{"foo":1}'])('rejects malformed output %j', (raw) => {
    expect(parseVerifierReply(raw).ok).toBe(false);
  });
  it('verdict precedence', () => {
    const c = (status: 'confirmat' | 'discutabil' | 'greșit') => ({ claim: 'x', status, reason: '' });
    expect(computeVerdict([c('confirmat')])).toBe('verificat');
    expect(computeVerdict([c('confirmat'), c('greșit'), c('discutabil')])).toBe('contrazis');
  });
});

describe('runCrossCheck (mocked fetch)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function setup(keys: Record<string, string>) {
    const { useAIStore } = await import('../../store/aiStore');
    useAIStore.setState({ provider: 'groq', apiKey: keys.groq ?? '', providerKeys: keys, hasKey: true });
    return import('./crossCheck');
  }
  const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 321 } }), { status: 200 });

  it('refuses without a second provider, without any request', async () => {
    const mod = await setup({ groq: `gsk_${'x'.repeat(40)}` });
    const out = await mod.runCrossCheck({ question: 'q', answer: 'a', producer: G });
    expect(out.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls only the verifier provider, never leaks keys, and reports tokens', async () => {
    const mod = await setup({ groq: `gsk_${'x'.repeat(40)}`, google: 'g'.repeat(30) });
    fetchMock.mockResolvedValue(reply(JSON.stringify({ claims: [{ claim: 'x', status: 'confirmat', reason: 'ok' }] })));
    const promise = mod.runCrossCheck({ question: 'q', answer: 'a', producer: G });
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage');
    expect(out.ok && out.verifier.provider).toBe('google');
    expect(out.ok && out.tokens).toBe(321);
    expect(JSON.stringify(out)).not.toContain('ggggg');
  });

  it('returns a clean error (no fallback to the producer) when the verifier fails', async () => {
    const mod = await setup({ groq: `gsk_${'x'.repeat(40)}`, google: 'g'.repeat(30) });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
    const promise = mod.runCrossCheck({ question: 'q', answer: 'a', producer: G });
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await promise;
    expect(out.ok).toBe(false);
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('generativelanguage'))).toBe(true);
  });

  it('reports malformed verifier output as an error', async () => {
    const mod = await setup({ groq: `gsk_${'x'.repeat(40)}`, google: 'g'.repeat(30) });
    fetchMock.mockResolvedValue(reply('Nu pot verifica asta.'));
    const promise = mod.runCrossCheck({ question: 'q', answer: 'a', producer: G });
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await promise;
    expect(out.ok).toBe(false);
  });
});
