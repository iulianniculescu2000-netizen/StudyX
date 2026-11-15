/**
 * Plauzibilitatea distractorilor (agentul „plauzibilitate” din Grile rezidentiat): judecătorul numește distractorii
 * evident implauzibili, iar grila cu cel puțin doi dintre ei cade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';

const groqRequest = vi.fn();
vi.mock('../lib/groq', () => ({
  groqRequest: (...args: unknown[]) => groqRequest(...args),
  getLastServedModel: () => null,
}));
vi.mock('../store/aiStore', () => ({
  useAIStore: { getState: () => ({}) },
  getConfiguredProviderModels: () => [],
}));
vi.mock('../store/aiUsageStore', () => ({
  useAIUsageStore: { getState: () => ({ windows: {} }) },
}));

const { verifyQuestionsMedically, weakDistractorCount, WEAK_DISTRACTORS_TO_DROP } = await import('./medicalJudge');

function q(text: string): Question {
  return {
    id: text,
    text,
    options: ['corect', 'vecin', 'absurd unu', 'absurd doi', 'inversat'].map((t, i) => ({ id: String(i), text: t, isCorrect: i === 0 })),
  };
}
const verdicts = (list: Array<Record<string, unknown>>) => JSON.stringify({ verdicts: list });

describe('plauzibilitatea distractorilor', () => {
  beforeEach(() => groqRequest.mockReset());

  it('promptul cere literele distractorilor implauzibili și arată formatul', async () => {
    groqRequest.mockResolvedValueOnce(verdicts([{ i: 0, correct: true }]));
    await verifyQuestionsMedically([q('Întrebarea 1:')], undefined, { plausibility: true });
    const prompt: string = groqRequest.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('PLAUZIBILITATE');
    expect(prompt).toContain('"weak"');
    expect(prompt).toContain('entitate vecină');
  });

  it('numără doar distractorii; litera cheii și literele inexistente nu contează', () => {
    const question = q('x');
    expect(weakDistractorCount(question, { weak: ['c', 'd'] })).toBe(2);
    expect(weakDistractorCount(question, { weak: ['a', 'z'] })).toBe(0);
    expect(weakDistractorCount(question, { weak: ['C', ' d '] })).toBe(2);
    expect(weakDistractorCount(question, undefined)).toBe(0);
    expect(weakDistractorCount(question, {})).toBe(0);
    expect(WEAK_DISTRACTORS_TO_DROP).toBe(2);
  });

  it('scoate grila cu doi distractori implauzibili, o păstrează pe cea cu unul', async () => {
    const batch = [q('Întrebarea 1:'), q('Întrebarea 2:'), q('Întrebarea 3:')];
    groqRequest.mockResolvedValueOnce(verdicts([
      { i: 0, correct: true, weak: ['c', 'd'] },
      { i: 1, correct: true, weak: ['c'] },
      { i: 2, correct: true },
    ]));
    const result = await verifyQuestionsMedically(batch, undefined, { plausibility: true });
    expect(result.questions.map((x) => x.text)).toEqual(['Întrebarea 2:', 'Întrebarea 3:']);
    expect(result.flaggedCount).toBe(1);
    expect(result.flaggedReasons[0]).toContain('distractori implauzibili');
  });

  it('fără opțiune (pista de facultate) nici promptul, nici filtrul nu se schimbă', async () => {
    groqRequest.mockResolvedValueOnce(verdicts([{ i: 0, correct: true, weak: ['c', 'd'] }, { i: 1, correct: true }]));
    const result = await verifyQuestionsMedically([q('Întrebarea 1:'), q('Întrebarea 2:')], undefined);
    expect(groqRequest.mock.calls[0][0].messages[0].content).not.toContain('PLAUZIBILITATE');
    expect(result.questions).toHaveLength(2);
  });

  it('nu golește lotul când toate grilele ar cădea', async () => {
    const batch = [q('Întrebarea 1:'), q('Întrebarea 2:')];
    groqRequest.mockResolvedValueOnce(verdicts([{ i: 0, correct: true, weak: ['c', 'd'] }, { i: 1, correct: true, weak: ['c', 'e'] }]));
    const result = await verifyQuestionsMedically(batch, undefined, { plausibility: true });
    expect(result.questions).toHaveLength(2);
    expect(result.flaggedCount).toBe(0);
  });
});
