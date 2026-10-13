import { beforeEach, describe, expect, it, vi } from 'vitest';

const stream = vi.hoisted(() => ({ calls: [] as Array<{ user: string }> }));
vi.mock('./streaming', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./streaming')>()),
  groqStream: vi.fn(async (messages: Array<{ role: string; content: string }>) => {
    stream.calls.push({ user: messages.find((m) => m.role === 'user')?.content ?? '' });
    return '';
  }),
}));

describe('raportul „Ce nu știu?”', () => {
  beforeEach(() => { stream.calls.length = 0; });

  it('cere un format organizat (zonă slabă, plan, examen) și interzice cifrele inventate', async () => {
    const { generateWeakSpotReport } = await import('./study');
    await generateWeakSpotReport({ weakCategories: [{ name: 'Cardiologie', accuracy: 42, quizCount: 3 }], totalAccuracy: 61, streak: 2, totalAnswered: 120, recentMistakeTopics: ['Aritmii'] }, () => undefined);
    const prompt = stream.calls[0]?.user ?? '';
    expect(prompt).toContain('**Zona cea mai slabă:');
    expect(prompt).toContain('**Plan pentru săptămâna asta**');
    expect(prompt).toContain('**Pentru examen**');
    expect(prompt).toMatch(/nu inventa procente-țintă/);
    expect(prompt).not.toMatch(/un singur paragraf|FĂRĂ titluri/);
    expect(prompt).toContain('Cardiologie: 42%');
  });

  it('fără date nu cheamă modelul și îndrumă studentul', async () => {
    const { generateWeakSpotReport } = await import('./study');
    const chunks: string[] = [];
    await generateWeakSpotReport({ weakCategories: [], totalAccuracy: 0, streak: 0, totalAnswered: 0, recentMistakeTopics: [] }, (c) => chunks.push(c));
    expect(stream.calls).toHaveLength(0);
    expect(chunks.join('')).toMatch(/Nu există suficiente date/);
  });
});
