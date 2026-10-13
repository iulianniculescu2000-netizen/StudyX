import { beforeEach, describe, expect, it, vi } from 'vitest';

const structured = vi.hoisted(() => ({ calls: [] as Array<{ user: string }>, replies: [] as unknown[][] }));

vi.mock('../lib/ai/structured', () => ({
  requestStructuredOrThrow: vi.fn(async (req: { messages: Array<{ role: string; content: string }> }) => {
    structured.calls.push({ user: req.messages.find((m) => m.role === 'user')?.content ?? '' });
    return { questions: structured.replies.shift() ?? [] };
  }),
}));
vi.mock('./medicalJudge', () => ({
  verifyQuestionsMedically: vi.fn(async (questions: unknown[]) => ({ questions, flaggedCount: 0, flaggedReasons: [] })),
}));
vi.mock('../lib/groq', () => ({ groqRequest: vi.fn(), groqStream: vi.fn() }));

const raw = (text: string) => ({
  text,
  options: [
    { text: 'Varianta A', isCorrect: true },
    { text: 'Varianta B', isCorrect: false },
    { text: 'Varianta C', isCorrect: false },
    { text: 'Varianta D', isCorrect: false },
    { text: 'Varianta E', isCorrect: false },
  ],
  explanation: 'Explicație',
});

describe('generateQuestionsFromTopic: „5 cerute, 2 primite”', () => {
  beforeEach(() => {
    structured.calls.length = 0;
    structured.replies.length = 0;
  });

  it('cere doar ce lipsește și livrează 5', async () => {
    structured.replies.push(
      [raw('Care este cea mai frecventă cauză de infarct?'), raw('Ce marker apare primul în infarct?')],
      [raw('Ce artera irigă peretele anterior al ventriculului stâng?'), raw('Ce tratament e indicat în STEMI?'), raw('Care e complicația mecanică tardivă?')],
    );
    const { generateQuestionsFromTopic } = await import('./AIEngine');
    const result = await generateQuestionsFromTopic('infarct miocardic', 5, 'medium', 'single', null, 'residency');
    expect(result.questions).toHaveLength(5);
    expect(result.requested).toBe(5);
    expect(result.topUpRounds).toBe(1);
    expect(structured.calls).toHaveLength(2);
    expect(structured.calls[1].user).toContain('Generează 3 întrebări');
    expect(structured.calls[1].user).toContain('Nu repeta');
    expect(structured.calls[1].user).toContain('cea mai frecventă cauză de infarct');
  });

  it('taie la numărul cerut când modelul întoarce mai multe („30 cerute, 33 primite”)', async () => {
    structured.replies.push(Array.from({ length: 33 }, (_, i) => raw(`Întrebarea numărul ${i + 1} despre artrita reumatoidă`)));
    const { generateQuestionsFromTopic } = await import('./AIEngine');
    const result = await generateQuestionsFromTopic('artrita reumatoidă', 30, 'medium', 'single', null, 'residency');
    expect(result.questions).toHaveLength(30);
    expect(result.requested).toBe(30);
    expect(structured.calls).toHaveLength(1);
  });

  it('nu face runde în plus când primul lot ajunge', async () => {
    structured.replies.push([raw('Întrebarea cu numărul unu'), raw('Întrebarea cu numărul doi')]);
    const { generateQuestionsFromTopic } = await import('./AIEngine');
    const result = await generateQuestionsFromTopic('infarct', 2, 'medium', 'single', null, 'simple');
    expect(result.questions).toHaveLength(2);
    expect(result.topUpRounds).toBe(0);
    expect(structured.calls).toHaveLength(1);
  });
});
