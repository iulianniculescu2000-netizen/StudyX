/**
 * When a message clearly wants an action but the planner is missing something
 * essential (which course, which folder), it must say so explicitly instead of
 * either guessing or being silently discarded as "not a command" — the caller
 * (AIChatDrawer) relies on `needsClarification` to show the question instead of
 * falling through to a generic chat answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const groqRequest = vi.fn();
vi.mock('../groq', () => ({
  groqRequest: (...args: unknown[]) => groqRequest(...args),
  notesToFlashcards: vi.fn(),
}));

const { planAgentCommand } = await import('./agent');

describe('planAgentCommand — needsClarification', () => {
  beforeEach(() => groqRequest.mockReset());

  it('surfaces the planner-asked clarifying question and keeps isCommand false', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      isCommand: false,
      needsClarification: true,
      reply: 'Despre ce curs sau subiect vrei grilele?',
      steps: [],
    }));
    const result = await planAgentCommand('fă-mi niște grile', []);
    expect(result.isCommand).toBe(false);
    expect(result.needsClarification).toBe(true);
    expect(result.reply).toBe('Despre ce curs sau subiect vrei grilele?');
    expect(result.steps).toHaveLength(0);
  });

  it('does not set needsClarification for an ordinary non-command message', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      isCommand: false,
      needsClarification: false,
      reply: '',
      steps: [],
    }));
    const result = await planAgentCommand('ce este fibrilația atrială?', []);
    expect(result.isCommand).toBe(false);
    expect(result.needsClarification).toBeFalsy();
  });

  it('a resolvable command (steps present) is never flagged as needing clarification', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      isCommand: true,
      needsClarification: false,
      reply: 'Gata',
      steps: [{ action: 'generate_quiz_topic', topic: 'nefronul', questionsPerPack: 10 }],
    }));
    const result = await planAgentCommand('fa mi 10 grile despre nefron', []);
    expect(result.isCommand).toBe(true);
    expect(result.needsClarification).toBeFalsy();
    expect(result.steps).toHaveLength(1);
  });

  it('falls back to a generic clarifying question when the planner sets the flag but forgets the reply text', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      isCommand: false,
      needsClarification: true,
      reply: '',
      steps: [],
    }));
    const result = await planAgentCommand('mută-l în folder', []);
    expect(result.needsClarification).toBe(true);
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it('treats a dropped unresolved referential topic as needing clarification even if the planner did not flag it', async () => {
    groqRequest
      .mockResolvedValueOnce(JSON.stringify({
        isCommand: true,
        needsClarification: false,
        reply: 'Gata',
        steps: [{ action: 'generate_quiz_topic', topic: 'subiectul discutat', questionsPerPack: 10 }],
      }))
      .mockResolvedValueOnce('NONE'); // resolveDiscussedTopic finds nothing concrete
    const result = await planAgentCommand('fa mi grile despre subiectul discutat', []);
    expect(result.steps).toHaveLength(0);
    expect(result.isCommand).toBe(false);
    expect(result.needsClarification).toBe(true);
    expect(result.reply.length).toBeGreaterThan(0);
  });
});
