import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GroqModule = typeof import('./groq');
type Interrupted = InstanceType<GroqModule['FlashcardGenerationInterrupted']>;
// Loaded fresh for every test: the request limiter keeps module-level queue state that must not leak between tests.
let FlashcardGenerationInterrupted: GroqModule['FlashcardGenerationInterrupted'];
let NoNewFlashcardsError: GroqModule['NoNewFlashcardsError'];
let notesToFlashcards: GroqModule['notesToFlashcards'];

const WORDS = [
  'hiperemie', 'artroza', 'spondiloza', 'namol', 'kinetoterapie', 'electroterapie', 'hidroterapie', 'crioterapie',
  'ultrasunete', 'laser', 'magnetoterapie', 'parafina', 'masaj', 'tractiune', 'ortezare', 'mobilizare', 'termalism',
  'climatoterapie', 'sulfuri', 'radon', 'bicarbonat', 'clorura', 'iod', 'brom', 'fibromialgie', 'sciatica', 'lombalgie',
  'cervicalgie', 'gonartroza', 'coxartroza', 'osteoporoza', 'tendinita', 'bursita', 'entorsa', 'luxatie', 'fractura',
  'cicatrice', 'edem', 'contractura', 'spasticitate',
];

/** `count` cards whose fronts share no words, so the duplicate filter keeps all of them. */
function cardsJson(count: number, round: number) {
  return JSON.stringify(Array.from({ length: count }, (_, i) => {
    const pick = (k: number) => WORDS[(round * 13 + i * 3 + k) % WORDS.length];
    return {
      front: `Ce rol are ${pick(0)} față de ${pick(1)} în ${pick(2)} (${round}-${i})?`,
      back: `Răspunsul despre ${pick(0)} și ${pick(1)} numărul ${round}-${i}.`,
    };
  }));
}

function ok(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status: number, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Long enough (> 5200 chars) to be split into several chunks. */
const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `Capitolul ${i}. ${'Balneofizioterapia studiază factorii naturali în tratamentul afecțiunilor reumatismale. '.repeat(3)}`).join('\n\n');

/**
 * The test setup runs on fake timers, so the request limiter's spacing and any
 * countdown only elapse when time is advanced. Resolves to the value or the error.
 */
async function drive<T>(promise: Promise<T>, ms = 10_000): Promise<T | unknown> {
  const settled = promise.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(ms);
  return settled;
}

describe('notesToFlashcards — interruption and pacing', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const groq = await import('./groq');
    FlashcardGenerationInterrupted = groq.FlashcardGenerationInterrupted;
    NoNewFlashcardsError = groq.NoNewFlashcardsError;
    notesToFlashcards = groq.notesToFlashcards;
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

  it('hands back the cards already made when a later batch fails (keepPartialOnError)', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(ok(cardsJson(10, 1))))
      .mockImplementation(() => Promise.resolve(fail(400, 'Bad request')));

    const error = await drive(notesToFlashcards(LONG_TEXT, { count: 20, keepPartialOnError: true }));

    expect(error).toBeInstanceOf(FlashcardGenerationInterrupted);
    const interrupted = error as Interrupted;
    expect(interrupted.partial).toHaveLength(10);
    expect(interrupted.nextChunk).toBe(1);
    expect(interrupted.waitSeconds).toBeNull();
  });

  it('still rethrows the original error when nothing was generated yet', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(fail(400, 'Bad request')));

    const error = await drive(notesToFlashcards(LONG_TEXT, { count: 20, keepPartialOnError: true }));

    expect(error).not.toBeInstanceOf(FlashcardGenerationInterrupted);
    expect((error as Error).message).toContain('Bad request');
  });

  it('keeps today\'s behaviour for callers that do not opt in', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(ok(cardsJson(10, 1))))
      .mockImplementation(() => Promise.resolve(fail(400, 'Bad request')));

    const error = await drive(notesToFlashcards(LONG_TEXT, { count: 20 }));

    expect(error).not.toBeInstanceOf(FlashcardGenerationInterrupted);
    expect((error as Error).message).toContain('Bad request');
  });

  it('resumes from the chunk that failed', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(ok(cardsJson(10, 2))))
      .mockImplementation(() => Promise.resolve(fail(400, 'Bad request')));
    const interrupted = await drive(notesToFlashcards(LONG_TEXT, { count: 20, keepPartialOnError: true })) as Interrupted;

    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(ok(cardsJson(10, 5))));
    const rest = await drive(notesToFlashcards(LONG_TEXT, {
      count: 10,
      avoidFronts: interrupted.partial.map((card) => card.front),
      startChunk: interrupted.nextChunk,
      chunkBudget: 20,
    })) as { front: string; back: string }[];

    expect(rest).toHaveLength(10);
    // The resumed request must carry the second chunk, not the first one again.
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[1].content as string;
    expect(sent).toContain('exact 10 flashcarduri');
    expect(sent).not.toContain('Capitolul 0.');
  });

  it('waits out a short rate limit by itself when the caller opts in with onWait', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(fail(429, 'Rate limit reached for model. Please try again in 20s.', { 'retry-after': '20' })))
      .mockImplementation(() => Promise.resolve(ok(cardsJson(5, 3))));
    const ticks: number[] = [];

    const cards = await drive(
      notesToFlashcards(LONG_TEXT.slice(0, 3000), { count: 5, onWait: (left) => ticks.push(left) }),
      40_000,
    ) as { front: string; back: string }[];

    expect(cards).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ticks[0]).toBe(21);
    expect(ticks[ticks.length - 1]).toBe(1);
  });

  it('does not wait without onWait, and never waits past the limit', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(fail(429, 'Rate limit reached for model. Please try again in 20s.', { 'retry-after': '20' })));
    const withoutOptIn = await drive(notesToFlashcards(LONG_TEXT.slice(0, 3000), { count: 5 }));
    expect((withoutOptIn as Error).message).toMatch(/rate limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(fail(429, 'Rate limit reached for model. Please try again in 10m.', { 'retry-after': '600' })));
    const ticks: number[] = [];
    const tooLong = await drive(notesToFlashcards(LONG_TEXT.slice(0, 3000), { count: 5, onWait: (left) => ticks.push(left) }));
    expect((tooLong as Error).message).toMatch(/rate limit/i);
    expect(ticks).toHaveLength(0);
  });

  it('reports "no new cards" as its own error', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok('[]')));
    const error = await drive(notesToFlashcards(LONG_TEXT.slice(0, 3000), { count: 5 }));
    expect(error).toBeInstanceOf(NoNewFlashcardsError);
  });
});
