/**
 * Verificatorul „orb”: rezolvă grila fără să vadă cheia; diferența față de cheie scoate grila.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';

const groqRequest = vi.fn();
let lastServed: { provider: string; model: string } | null = null;
let configured: Array<{ provider: string; model: string }> = [];

vi.mock('../lib/groq', () => ({
  groqRequest: (...args: unknown[]) => groqRequest(...args),
  getLastServedModel: () => lastServed,
}));
vi.mock('../store/aiStore', () => ({
  useAIStore: { getState: () => ({}) },
  getConfiguredProviderModels: () => configured,
}));
vi.mock('../store/aiUsageStore', () => ({
  useAIUsageStore: { getState: () => ({ windows: {} }) },
}));

const { verifyQuestionsMedically, blindVerify, buildBlindPrompt } = await import('./medicalJudge');

function q(text: string, correct: number[], count = 5): Question {
  return {
    id: text,
    text,
    multipleCorrect: correct.length > 1,
    options: Array.from({ length: count }, (_, i) => ({ id: `${text}-${i}`, text: `varianta ${i}`, isCorrect: correct.includes(i) })),
  };
}
const verdictsOk = (n: number) => JSON.stringify({ verdicts: Array.from({ length: n }, (_, i) => ({ i, correct: true })) });
const answers = (list: Array<[number, string[]]>) => JSON.stringify({ answers: list.map(([i, picks]) => ({ i, picks })) });

describe('verificatorul orb', () => {
  beforeEach(() => {
    groqRequest.mockReset();
    lastServed = { provider: 'groq', model: 'openai/gpt-oss-120b' };
    configured = [
      { provider: 'groq', model: 'openai/gpt-oss-120b' },
      { provider: 'google', model: 'gemini-3.8-flash' },
    ];
  });

  it('promptul nu conține nicio marcă de cheie și cere literele', () => {
    const prompt = buildBlindPrompt([q('Enunț A:', [0]), q('Enunț B:', [1, 3])], undefined);
    expect(prompt).not.toContain('MARCAT CORECT');
    expect(prompt).toContain('a) varianta 0');
    expect(prompt).toContain('"answers"');
    expect(prompt).toContain('FALS');
  });

  it('păstrează grilele cu același răspuns ca cheia și scoate pe cele cu răspuns diferit', async () => {
    const batch = [q('Întrebarea 1:', [2]), q('Întrebarea 2:', [0, 3]), q('Întrebarea 3:', [1])];
    groqRequest.mockResolvedValueOnce(answers([[0, ['c']], [1, ['d', 'a']], [2, ['e']]]));
    const result = await blindVerify(batch, 'sursă'.repeat(100));
    expect(result.questions.map((x) => x.text)).toEqual(['Întrebarea 1:', 'Întrebarea 2:']);
    expect(result.flaggedCount).toBe(1);
    expect(result.flaggedReasons[0]).toContain('Întrebarea 3');
  });

  it('rulează pe alt furnizor decât generatorul', async () => {
    groqRequest.mockResolvedValueOnce(answers([[0, ['a']]]));
    await blindVerify([q('Întrebarea 1:', [0])], undefined);
    expect(groqRequest.mock.calls[0][0].only).toEqual({ provider: 'google', model: 'gemini-3.8-flash' });
  });

  it('e deschis la erori: eroare de rețea, răspuns necitibil sau grilă fără intrare lasă lotul intact', async () => {
    const batch = [q('Întrebarea 1:', [0]), q('Întrebarea 2:', [1])];
    groqRequest.mockRejectedValue(new Error('429'));
    expect((await blindVerify(batch, undefined)).questions).toHaveLength(2);

    groqRequest.mockReset();
    groqRequest.mockResolvedValue('nu e json');
    expect((await blindVerify(batch, undefined)).flaggedCount).toBe(0);

    groqRequest.mockReset();
    groqRequest.mockResolvedValueOnce(answers([[0, ['a']]]));
    const partial = await blindVerify(batch, undefined);
    expect(partial.questions).toHaveLength(2);
  });

  it('nu golește tot lotul când toate răspunsurile diferă', async () => {
    const batch = [q('Întrebarea 1:', [0]), q('Întrebarea 2:', [1])];
    groqRequest.mockResolvedValueOnce(answers([[0, ['e']], [1, ['e']]]));
    const result = await blindVerify(batch, undefined);
    expect(result.questions).toHaveLength(2);
    expect(result.flaggedCount).toBe(0);
  });

  it('în verifyQuestionsMedically e oprit implicit și pornit la cerere, după judecător', async () => {
    const batch = [q('Întrebarea 1:', [0]), q('Întrebarea 2:', [1])];
    groqRequest.mockResolvedValueOnce(verdictsOk(2));
    const off = await verifyQuestionsMedically(batch, undefined);
    expect(groqRequest).toHaveBeenCalledTimes(1);
    expect(off.questions).toHaveLength(2);

    groqRequest.mockReset();
    groqRequest.mockResolvedValueOnce(verdictsOk(2)).mockResolvedValueOnce(answers([[0, ['a']], [1, ['c']]]));
    const on = await verifyQuestionsMedically(batch, undefined, { blind: true });
    expect(groqRequest).toHaveBeenCalledTimes(2);
    expect(on.questions.map((x) => x.text)).toEqual(['Întrebarea 1:']);
    expect(on.flaggedCount).toBe(1);
    expect(on.checked).toBe(true);
  });

  it('judecătorul respinge întâi; verificatorul orb vede doar ce a rămas', async () => {
    const batch = [q('Întrebarea 1:', [0]), q('Întrebarea 2:', [1])];
    groqRequest
      .mockResolvedValueOnce(JSON.stringify({ verdicts: [{ i: 0, correct: false, reason: 'cheie greșită' }, { i: 1, correct: true }] }))
      .mockResolvedValueOnce(answers([[0, ['b']]]));
    const result = await verifyQuestionsMedically(batch, undefined, { blind: true });
    expect(result.questions.map((x) => x.text)).toEqual(['Întrebarea 2:']);
    const blindPrompt: string = groqRequest.mock.calls[1][0].messages[0].content;
    expect(blindPrompt).toContain('Întrebarea 2:');
    expect(blindPrompt).not.toContain('Întrebarea 1:');
  });
});
