import { describe, expect, it, vi } from 'vitest';
import { explainAnswerInline, explainWrongAnswer } from './study';

const calls = vi.hoisted(() => ({ chat: vi.fn(), stream: vi.fn() }));
vi.mock('./requests', () => ({ groqChat: calls.chat }));
vi.mock('./streaming', () => ({ groqStream: calls.stream }));
vi.mock('../aiContext', () => ({ getMedicalSystemPrompt: (_kind: string, context?: string) => `Reguli medicale și context: ${context ?? ''}` }));

describe('compact study prompts preserve the request contract', () => {
  it('passes every option and every correct marker once to streaming', async () => {
    const options = [{ text: 'Prima alegere QA', isCorrect: true }, { text: 'A doua alegere QA', isCorrect: true }, { text: 'Distractor QA', isCorrect: false }];
    const chunks = vi.fn();
    const controller = new AbortController();
    await explainAnswerInline('Enunț QA', options, chunks, controller.signal, 'Context personal');
    const [messages, callback, temperature, signal] = calls.stream.mock.calls.at(-1)!;
    expect(messages[0].content).toContain('Context personal');
    const prompt = messages[1].content as string;
    for (const option of options) expect(prompt.split(option.text)).toHaveLength(2);
    expect(prompt).toContain('"corect":true');
    expect(prompt).toContain('"corect":false');
    expect(prompt).toContain('verifică toată cheia');
    expect(prompt).toContain('nu ești sigur');
    expect(callback).toBe(chunks);
    expect(temperature).toBe(0.3);
    expect(signal).toBe(controller.signal);
    expect(prompt.length).toBeLessThan(1100);
  });

  it('retains the chosen answer and uncertainty rules without repeating the key', async () => {
    calls.chat.mockResolvedValue('Explicație');
    expect(await explainWrongAnswer('Enunț QA', 'Alegerea studentului QA', 'Cheia completă QA', 'Profil QA')).toBe('Explicație');
    const [messages] = calls.chat.mock.calls.at(-1)!;
    const prompt = messages[1].content as string;
    expect(prompt.split('Cheia completă QA')).toHaveLength(2);
    expect(prompt).toContain('Alegerea studentului QA');
    expect(prompt).toContain('nu justifica o cheie');
    expect(prompt).toContain('Maximum 4–5 propoziții');
    expect(messages[0].content).toContain('Profil QA');
  });

  it('retains the active recall treatment when the student forgot the context', async () => {
    await explainWrongAnswer('Enunț QA', 'am uitat contextul', 'Cheie QA');
    const [messages] = calls.chat.mock.calls.at(-1)!;
    expect(messages[1].content).toContain('nu a formulat răspunsul din memorie');
  });
});
