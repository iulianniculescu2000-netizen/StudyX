/**
 * The planner must survive malformed model output: chatter and fences around the
 * JSON, string numbers, unknown actions, a plan that is unusable (one repair
 * attempt) and prose with no JSON at all (plain chat, no repair spent).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const groqRequest = vi.fn();
vi.mock('../groq', () => ({
  groqRequest: (...args: unknown[]) => groqRequest(...args),
  notesToFlashcards: vi.fn(),
}));

const { planAgentCommand } = await import('./agent');

const FENCE = '```';

describe('planAgentCommand — malformed plans', () => {
  beforeEach(() => groqRequest.mockReset());

  it('asks the model for JSON mode', async () => {
    groqRequest.mockResolvedValueOnce('{"isCommand":false,"reply":"","steps":[]}');
    await planAgentCommand('creează un folder', []);
    expect(groqRequest.mock.calls[0][0]).toMatchObject({ jsonMode: true, task: 'analysis' });
  });

  it('reads a plan wrapped in chatter and code fences, with string numbers', async () => {
    groqRequest.mockResolvedValueOnce(
      `Sigur, iată planul:\n${FENCE}json\n{"isCommand":true,"reply":"Gata","steps":[{"action":"create_flashcards","source":"Cardiologie","count":"20"}]}\n${FENCE}\nSper că e bine!`,
    );
    const plan = await planAgentCommand('fă-mi 20 de flashcarduri din Cardiologie', []);
    expect(plan.isCommand).toBe(true);
    expect(plan.steps[0]).toMatchObject({ action: 'create_flashcards', source: 'Cardiologie', count: 20 });
    expect(groqRequest).toHaveBeenCalledTimes(1);
  });

  it('drops a step with an unknown action but keeps the valid one', async () => {
    groqRequest.mockResolvedValueOnce(
      '{"isCommand":true,"reply":"","steps":[{"action":"format_disk"},{"action":"create_folder","name":"Cardio"}]}',
    );
    const plan = await planAgentCommand('creează folderul Cardio', []);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].action).toBe('create_folder');
    expect(plan.isCommand).toBe(true);
  });

  it('repairs once when a command has only unusable steps', async () => {
    groqRequest
      .mockResolvedValueOnce('{"isCommand":true,"steps":[{"action":"creeaza_folder","name":"Cardio"}]}')
      .mockResolvedValueOnce('{"isCommand":true,"reply":"","steps":[{"action":"create_folder","name":"Cardio"}]}');
    const plan = await planAgentCommand('creează folderul Cardio', []);
    expect(groqRequest).toHaveBeenCalledTimes(2);
    expect(groqRequest.mock.calls[1][0].temperature).toBe(0);
    expect(JSON.stringify(groqRequest.mock.calls[1][0].messages)).toContain('niciun pas valid');
    expect(plan.isCommand).toBe(true);
    expect(plan.steps[0].action).toBe('create_folder');
  });

  it('degrades to "not a command" when the repair is unusable too', async () => {
    groqRequest.mockResolvedValue('{"isCommand":true,"steps":[{"action":"nope"}]}');
    const plan = await planAgentCommand('ceva neclar', []);
    expect(groqRequest).toHaveBeenCalledTimes(2);
    expect(plan.isCommand).toBe(false);
    expect(plan.steps).toHaveLength(0);
  });

  it('treats a prose reply as not a command, without a repair call', async () => {
    groqRequest.mockResolvedValueOnce('Bineînțeles! Cu ce te pot ajuta?');
    const plan = await planAgentCommand('salut', []);
    expect(groqRequest).toHaveBeenCalledTimes(1);
    expect(plan).toMatchObject({ isCommand: false, steps: [], needsConfirm: false });
  });

  it('keeps the complete steps of a truncated plan', async () => {
    groqRequest.mockResolvedValueOnce(
      '{"isCommand":true,"reply":"","steps":[{"action":"create_folder","name":"A"},{"action":"create_folder","name":"B"},{"action":"create_fol',
    );
    const plan = await planAgentCommand('creează folderele A și B', []);
    expect(plan.steps.map((step) => step.name)).toEqual(['A', 'B']);
    expect(plan.isCommand).toBe(true);
  });

  it('survives an undefined reply from a failing mock', async () => {
    groqRequest.mockResolvedValueOnce(undefined);
    const plan = await planAgentCommand('salut', []);
    expect(plan.isCommand).toBe(false);
  });
});
