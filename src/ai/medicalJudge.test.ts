import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';

const groqRequest = vi.fn();
vi.mock('../lib/groq', () => ({
  groqRequest: (...args: unknown[]) => groqRequest(...args),
}));

const { verifyQuestionsMedically } = await import('./medicalJudge');

function q(id: string, text: string, correctText = 'răspuns corect'): Question {
  return {
    id,
    text,
    options: [
      { id: `${id}-a`, text: correctText, isCorrect: true },
      { id: `${id}-b`, text: 'distractor 1', isCorrect: false },
      { id: `${id}-c`, text: 'distractor 2', isCorrect: false },
    ],
  };
}

describe('verifyQuestionsMedically', () => {
  beforeEach(() => groqRequest.mockReset());

  it('passes everything through untouched when there are no questions', async () => {
    const result = await verifyQuestionsMedically([], undefined);
    expect(result).toEqual({ questions: [], flaggedCount: 0, flaggedReasons: [] });
    expect(groqRequest).not.toHaveBeenCalled();
  });

  it('drops a question the judge flags as medically wrong, keeps the rest', async () => {
    const questions = [q('1', 'Enunț bun'), q('2', 'Enunț cu răspuns greșit')];
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      verdicts: [
        { i: 0, correct: true },
        { i: 1, correct: false, reason: 'Mecanismul descris e incorect.' },
      ],
    }));

    const result = await verifyQuestionsMedically(questions, undefined);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].id).toBe('1');
    expect(result.flaggedCount).toBe(1);
    expect(result.flaggedReasons[0]).toContain('Mecanismul');
  });

  it('fails open (keeps all questions) when the request throws', async () => {
    groqRequest.mockRejectedValueOnce(new Error('offline'));
    const questions = [q('1', 'X'), q('2', 'Y')];
    const result = await verifyQuestionsMedically(questions, undefined);
    expect(result.questions).toEqual(questions);
    expect(result.flaggedCount).toBe(0);
  });

  it('fails open when the response is not valid JSON', async () => {
    groqRequest.mockResolvedValueOnce('nu pot răspunde acum');
    const questions = [q('1', 'X')];
    const result = await verifyQuestionsMedically(questions, undefined);
    expect(result.questions).toEqual(questions);
  });

  it('fails open when verdicts is missing entirely', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({ ok: true }));
    const questions = [q('1', 'X'), q('2', 'Y')];
    const result = await verifyQuestionsMedically(questions, undefined);
    expect(result.questions).toEqual(questions);
  });

  it('keeps a question the judge never gave a verdict for (partial response)', async () => {
    const questions = [q('1', 'X'), q('2', 'Y'), q('3', 'Z')];
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      verdicts: [{ i: 0, correct: true }], // 1 and 2 missing
    }));
    const result = await verifyQuestionsMedically(questions, undefined);
    expect(result.questions.map((question) => question.id)).toEqual(['1', '2', '3']);
  });

  it('refuses a pass that flags every question in a multi-question batch (treats it as a mismatch, not a real failure)', async () => {
    const questions = [q('1', 'X'), q('2', 'Y'), q('3', 'Z')];
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      verdicts: [
        { i: 0, correct: false, reason: 'a' },
        { i: 1, correct: false, reason: 'b' },
        { i: 2, correct: false, reason: 'c' },
      ],
    }));
    const result = await verifyQuestionsMedically(questions, undefined);
    expect(result.questions).toHaveLength(3); // fell back to passthrough
    expect(result.flaggedCount).toBe(0);
  });

  it('allows a single-question batch to be fully flagged (not a "flags everything" mismatch)', async () => {
    const questions = [q('1', 'X')];
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      verdicts: [{ i: 0, correct: false, reason: 'greșit' }],
    }));
    const result = await verifyQuestionsMedically(questions, undefined);
    expect(result.questions).toHaveLength(0);
    expect(result.flaggedCount).toBe(1);
  });

  it('splits a batch larger than the per-call cap into two parallel calls', async () => {
    const questions = Array.from({ length: 30 }, (_, i) => q(String(i), `Enunț ${i}`));
    groqRequest.mockResolvedValue(JSON.stringify({ verdicts: [] }));
    const result = await verifyQuestionsMedically(questions, undefined);
    expect(groqRequest).toHaveBeenCalledTimes(2);
    expect(result.questions).toHaveLength(30); // no verdicts given → all kept
  });

  it('includes the grounding text in the prompt when provided', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({ verdicts: [{ i: 0, correct: true }] }));
    await verifyQuestionsMedically([q('1', 'X')], 'Text curs despre nefron.');
    const sentPrompt = groqRequest.mock.calls[0][0].messages[0].content as string;
    expect(sentPrompt).toContain('Text curs despre nefron.');
  });
});
