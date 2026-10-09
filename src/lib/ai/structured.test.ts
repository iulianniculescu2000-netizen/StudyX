/**
 * requestStructured with a simulated `fetch` — the real groqRequest runs, so the
 * response_format negotiation and the repair pass are exercised end to end.
 * (Vitest installs fake timers globally: the request limiter only advances when time does.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

type StructuredModule = typeof import('./structured');
type SchemasModule = typeof import('./schemas');
let requestStructured: StructuredModule['requestStructured'];
let QuestionsBatchSchema: SchemasModule['QuestionsBatchSchema'];

function ok(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function drive<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  const settled = promise.then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.advanceTimersByTimeAsync(ms);
  const result = await settled;
  if ('error' in result) throw result.error;
  return result.value;
}

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) => JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string) as Record<string, unknown>;

const QUESTION = {
  text: 'Care este antidotul paracetamolului?',
  options: [{ text: 'N-acetilcisteină', isCorrect: true }, { text: 'Naloxonă', isCorrect: false }],
  explanation: 'NAC reface glutationul.',
};
const GOOD = JSON.stringify({ questions: [QUESTION] });

describe('requestStructured', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    ({ requestStructured } = await import('./structured'));
    ({ QuestionsBatchSchema } = await import('./schemas'));
    const { useAIStore } = await import('../../store/aiStore');
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

  const run = (extra: Partial<Parameters<StructuredModule['requestStructured']>[0]> = {}) => drive(requestStructured({
    schema: QuestionsBatchSchema,
    messages: [{ role: 'user', content: 'Generează 1 grilă în JSON.' }],
    task: 'questions',
    ...extra,
  } as Parameters<StructuredModule['requestStructured']>[0]));

  it('asks for JSON mode and returns the validated value', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(GOOD)));
    const result = await run();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repaired).toBe(false);
      expect((result.data as { questions: unknown[] }).questions).toHaveLength(1);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0).response_format).toEqual({ type: 'json_object' });
  });

  it('does not send response_format when jsonMode is off (bare-array prompts)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok(`[${JSON.stringify(QUESTION)}]`)));
    const result = await run({ jsonMode: false });
    expect(result.ok).toBe(true);
    expect(bodyOf(fetchMock, 0).response_format).toBeUndefined();
  });

  it('repairs an invalid reply once, showing the model the concrete error and the broken reply', async () => {
    const broken = '{"questions":[{"text":"Întrebare fără variante?"}]}';
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(ok(broken)))
      .mockImplementationOnce(() => Promise.resolve(ok(GOOD)));
    const result = await run({ schemaHint: '{"questions":[...]}' });

    expect(result.ok && result.repaired).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repair = bodyOf(fetchMock, 1);
    expect(repair.temperature).toBe(0);
    const text = JSON.stringify(repair.messages);
    expect(text).toContain('niciun element valid');
    expect(text).toContain('Întrebare fără variante?');
    expect(text).toContain('{\\"questions\\":[...]}');
  });

  it('fails cleanly (no throw) when the repair is also invalid, after exactly two calls', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok('{"questions":[{"text":"x"}]}')));
    const result = await run();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('după reparare');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not spend a repair call on a prose reply with nothing to fix', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok('Îmi pare rău, nu pot răspunde la asta.')));
    const result = await run();
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the complete items of a truncated reply without any repair call', async () => {
    const q = JSON.stringify(QUESTION);
    fetchMock.mockImplementation(() => Promise.resolve(ok(`{"questions":[${q},${q},{"text":"tăiat la mij`)));
    const result = await run();
    expect(result.ok && (result.data as { questions: unknown[] }).questions).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once without response_format when the provider rejects it, and remembers', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(fail(400, "'response_format' is not supported with this model")))
      .mockImplementation(() => Promise.resolve(ok(GOOD)));

    const first = await run();
    expect(first.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 0).response_format).toEqual({ type: 'json_object' });
    expect(bodyOf(fetchMock, 1).response_format).toBeUndefined();

    // Second request: the provider/model is remembered, so no doomed first try.
    const second = await run();
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock, 2).response_format).toBeUndefined();
  });

  it('does not remember "unsupported" when the plain request fails too (a 400 for another reason)', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(fail(400, 'Bad request')))
      .mockImplementationOnce(() => Promise.resolve(fail(400, 'Bad request')))
      .mockImplementation(() => Promise.resolve(ok(GOOD)));

    await expect(run()).rejects.toThrow();
    const next = await run();
    expect(next.ok).toBe(true);
    // The next request still tries JSON mode first.
    const lastCall = fetchMock.mock.calls.length - 1;
    expect(bodyOf(fetchMock, lastCall).response_format).toEqual({ type: 'json_object' });
  });

  it('works with any zod schema (generic)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok('```json\n{"n": 3}\n```')));
    const result = await run({ schema: z.object({ n: z.number() }) as unknown as typeof QuestionsBatchSchema });
    expect(result.ok && (result.data as unknown as { n: number }).n).toBe(3);
  });
});
