/**
 * groqStream: token budget per task and exact usage reporting (`stream_options`),
 * with a fallback for providers that reject the parameter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GroqModule = typeof import('./groq');
let groqStream: GroqModule['groqStream'];
let useAIUsageStore: typeof import('../store/aiUsageStore')['useAIUsageStore'];

function sse(lines: string[]) {
  return new Response(`${lines.map((line) => `data: ${line}`).join('\n\n')}\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const delta = (content: string) => JSON.stringify({ choices: [{ delta: { content } }] });
const usageChunk = (total: number) => JSON.stringify({ choices: [], usage: { prompt_tokens: total - 5, completion_tokens: 5, total_tokens: total } });

async function drive<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  const settled = promise.then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.advanceTimersByTimeAsync(ms);
  const result = await settled;
  if ('error' in result) throw result.error;
  return result.value;
}

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) => JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string) as Record<string, unknown>;

describe('groqStream', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    ({ groqStream } = await import('./groq'));
    ({ useAIUsageStore } = await import('../store/aiUsageStore'));
    useAIUsageStore.setState({ days: {} });
    const { useAIStore } = await import('../store/aiStore');
    useAIStore.setState({
      provider: 'groq',
      apiKey: `gsk_${'x'.repeat(40)}`,
      providerKeys: { groq: `gsk_${'x'.repeat(40)}` },
      hasKey: true,
    });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const todayUsage = () => Object.values(useAIUsageStore.getState().days)[0]?.groq;

  it('asks for usage and records the exact total instead of an estimate', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(sse([delta('Salut'), delta(' lume'), usageChunk(321), '[DONE]'])));
    const chunks: string[] = [];
    const full = await drive(groqStream([{ role: 'user', content: 'Salut' }], (c) => chunks.push(c), 0.5, undefined, true));

    expect(full).toBe('Salut lume');
    expect(chunks).toEqual(['Salut', ' lume']);
    expect(bodyOf(fetchMock, 0).stream_options).toEqual({ include_usage: true });
    expect(todayUsage()?.tokens).toBe(321);
    expect(todayUsage()?.estimated).toBe(false);
  });

  it('reports the provider finish_reason, so a cut-off answer can offer "Continuă"', async () => {
    const finish = (reason: string | null) => JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] });
    fetchMock.mockImplementationOnce(() => Promise.resolve(sse([delta('Text tăiat la mij'), finish('length'), '[DONE]'])));
    fetchMock.mockImplementationOnce(() => Promise.resolve(sse([delta('Text complet.'), finish('stop'), '[DONE]'])));
    fetchMock.mockImplementationOnce(() => Promise.resolve(sse([delta('Fără motiv'), '[DONE]'])));
    const reasons: Array<string | null> = [];
    for (let i = 0; i < 3; i += 1) {
      await drive(groqStream([{ role: 'user', content: 'q' }], () => {}, 0.5, undefined, true, { onFinish: (r) => reasons.push(r) }));
    }
    expect(reasons).toEqual(['length', 'stop', null]);
  });

  it('keeps the long-form budget for chat and uses TASK_MAX_TOKENS for other tasks', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(sse([delta('ok'), '[DONE]'])));
    await drive(groqStream([{ role: 'user', content: 'a' }], () => {}, 0.5, undefined, true));
    await drive(groqStream([{ role: 'user', content: 'b' }], () => {}, 0.5, undefined, true, { task: 'analysis' }));
    await drive(groqStream([{ role: 'user', content: 'c' }], () => {}, 0.5, undefined, true, { maxTokens: 123 }));
    expect(bodyOf(fetchMock, 0).max_tokens).toBe(4096);
    expect(bodyOf(fetchMock, 1).max_tokens).toBe(1000);
    expect(bodyOf(fetchMock, 2).max_tokens).toBe(123);
  });

  it('retries without stream_options when the provider rejects it, falls back to an estimate, and remembers', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'unknown field stream_options' } }), { status: 400 })))
      .mockImplementation(() => Promise.resolve(sse([delta('răspuns'), '[DONE]'])));

    const full = await drive(groqStream([{ role: 'user', content: 'Salut' }], () => {}, 0.5, undefined, true));
    expect(full).toBe('răspuns');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 0).stream_options).toBeDefined();
    expect(bodyOf(fetchMock, 1).stream_options).toBeUndefined();
    expect(todayUsage()?.estimated).toBe(true);

    await drive(groqStream([{ role: 'user', content: 'din nou' }], () => {}, 0.5, undefined, true));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock, 2).stream_options).toBeUndefined();
  });

  it('falls back to an estimate when the stream ends without a usage block', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(sse([delta('doar text'), '[DONE]'])));
    await drive(groqStream([{ role: 'user', content: 'Salut' }], () => {}, 0.5, undefined, true));
    expect(todayUsage()?.estimated).toBe(true);
    expect(todayUsage()?.tokens).toBeGreaterThan(0);
  });
});
