/**
 * Verificarea medicală pe alt model decât cel care a generat grilele, când există a doua cheie.
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

const { verifyQuestionsMedically, pickJudgeModel } = await import('./medicalJudge');

const question: Question = {
  id: '1',
  text: 'Tratamentul de fond în poliartrita reumatoidă este:',
  options: [
    { id: 'a', text: 'Metotrexat', isCorrect: true },
    { id: 'b', text: 'Paracetamol', isCorrect: false },
  ],
};
const OK = JSON.stringify({ verdicts: [{ i: 0, correct: true }] });

describe('verificatorul medical pe al doilea model', () => {
  beforeEach(() => {
    groqRequest.mockReset();
    lastServed = { provider: 'groq', model: 'openai/gpt-oss-120b' };
    configured = [
      { provider: 'groq', model: 'openai/gpt-oss-120b' },
      { provider: 'google', model: 'gemini-3.8-flash' },
    ];
  });

  it('alege un furnizor diferit de cel care a generat', () => {
    expect(pickJudgeModel()).toEqual({ provider: 'google', model: 'gemini-3.8-flash' });
  });

  it('cu o singură cheie sau fără generator cunoscut nu fixează nimic', () => {
    configured = [{ provider: 'groq', model: 'openai/gpt-oss-120b' }];
    expect(pickJudgeModel()).toBeNull();
    configured.push({ provider: 'google', model: 'gemini-3.8-flash' });
    lastServed = null;
    expect(pickJudgeModel()).toBeNull();
  });

  it('trimite verificarea doar la celălalt furnizor', async () => {
    groqRequest.mockResolvedValueOnce(OK);
    await verifyQuestionsMedically([question], undefined);
    expect(groqRequest).toHaveBeenCalledTimes(1);
    expect(groqRequest.mock.calls[0][0].only).toEqual({ provider: 'google', model: 'gemini-3.8-flash' });
  });

  it('dacă celălalt furnizor nu răspunde, verifică pe lanțul obișnuit', async () => {
    groqRequest.mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce(JSON.stringify({ verdicts: [{ i: 0, correct: false, reason: 'greșit' }] }));
    const result = await verifyQuestionsMedically([question], undefined);
    expect(groqRequest).toHaveBeenCalledTimes(2);
    expect(groqRequest.mock.calls[1][0].only).toBeUndefined();
    expect(result.flaggedCount).toBe(1);
  });

  it('cu o singură cheie cererea rămâne nefixată', async () => {
    configured = [{ provider: 'groq', model: 'openai/gpt-oss-120b' }];
    groqRequest.mockResolvedValueOnce(OK);
    await verifyQuestionsMedically([question], undefined);
    expect(groqRequest.mock.calls[0][0].only).toBeUndefined();
  });

  it('promptul cere verificarea distractorilor și tratează enunțurile negative', async () => {
    groqRequest.mockResolvedValueOnce(OK);
    await verifyQuestionsMedically([question], undefined);
    const prompt: string = groqRequest.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('variantele NEMARCATE');
    expect(prompt).toContain('cu excepția');
  });
});

describe('bugetul de răspuns al verificatorului', () => {
  beforeEach(() => {
    groqRequest.mockReset();
    configured = [{ provider: 'groq', model: 'openai/gpt-oss-120b' }];
  });

  it('lasă loc modelelor de raționament: mult peste vechiul 300 + 60 pe grilă', async () => {
    const { judgeMaxTokens } = await import('./medicalJudge');
    expect(judgeMaxTokens(2)).toBeGreaterThanOrEqual(2000);
    expect(judgeMaxTokens(25, 1)).toBeLessThanOrEqual(8000);
  });

  it('răspuns gol la prima încercare: reîncearcă o dată cu buget dublu și aplică verdictul', async () => {
    groqRequest.mockResolvedValueOnce('').mockResolvedValueOnce(JSON.stringify({ verdicts: [{ i: 0, correct: false, reason: 'cheie greșită' }] }));
    const result = await verifyQuestionsMedically([question], undefined);
    expect(groqRequest).toHaveBeenCalledTimes(2);
    expect(groqRequest.mock.calls[1][0].maxTokens).toBe(groqRequest.mock.calls[0][0].maxTokens * 2);
    expect(result).toMatchObject({ flaggedCount: 1, checked: true });
  });

  it('două răspunsuri goale: grilele trec, dar marcate ca neverificate', async () => {
    groqRequest.mockResolvedValue('');
    const result = await verifyQuestionsMedically([question], undefined);
    expect(result.questions).toHaveLength(1);
    expect(result.checked).toBeFalsy();
  });
});
