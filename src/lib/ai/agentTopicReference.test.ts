/**
 * "fă-mi grile despre subiectul discutat" used to be planned literally: the
 * topic reached the generator as the phrase itself, which produced nonsense or
 * failed validation outright. The topic must be resolved against the thread.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const groqRequest = vi.fn();
vi.mock('../groq', () => ({
  groqRequest: (...args: unknown[]) => groqRequest(...args),
  notesToFlashcards: vi.fn(),
}));

const { isReferentialTopic, resolveDiscussedTopic, planAgentCommand, describeStep, looksLikeAgentCommand } = await import('./agent');

describe('isReferentialTopic', () => {
  const referential = [
    'subiectul discutat',
    'Subiectul discutat',
    'subiectul de mai sus',
    'tema discutată',
    'tema de mai sus',
    'acelasi subiect',
    'despre ce am vorbit',
    'ce am discutat',
    'capitolul anterior',
    'asta',
    '',
  ];
  it.each(referential)('flags %j', (topic) => {
    expect(isReferentialTopic(topic)).toBe(true);
  });

  const concrete = ['embolia pulmonară', 'nefronul', 'insuficiența cardiacă acută', 'micoze cutanate'];
  it.each(concrete)('accepts %j', (topic) => {
    expect(isReferentialTopic(topic)).toBe(false);
  });
});

describe('resolveDiscussedTopic', () => {
  beforeEach(() => groqRequest.mockReset());

  const history = [
    { role: 'user' as const, content: 'explică-mi embolia pulmonară' },
    { role: 'assistant' as const, content: 'Embolia pulmonară apare prin obstrucția arterei...' },
  ];

  it('returns the extracted subject', async () => {
    groqRequest.mockResolvedValue('  "embolia pulmonară" \n');
    await expect(resolveDiscussedTopic(history)).resolves.toBe('embolia pulmonară');
  });

  it('returns null when the model finds nothing concrete', async () => {
    groqRequest.mockResolvedValue('NONE');
    await expect(resolveDiscussedTopic(history)).resolves.toBeNull();
  });

  it('rejects an answer that is itself a reference', async () => {
    groqRequest.mockResolvedValue('subiectul discutat');
    await expect(resolveDiscussedTopic(history)).resolves.toBeNull();
  });

  it('rejects a whole-sentence answer', async () => {
    groqRequest.mockResolvedValue('Conversația a fost despre embolia pulmonară și despre diagnosticul ei diferențial complet');
    await expect(resolveDiscussedTopic(history)).resolves.toBeNull();
  });

  it('does not call the model without a transcript', async () => {
    await expect(resolveDiscussedTopic([])).resolves.toBeNull();
    expect(groqRequest).not.toHaveBeenCalled();
  });

  it('survives a failing request', async () => {
    groqRequest.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await expect(resolveDiscussedTopic(history)).resolves.toBeNull();
  });
});

describe('planAgentCommand topic resolution', () => {
  beforeEach(() => groqRequest.mockReset());

  const plan = JSON.stringify({
    isCommand: true,
    reply: 'Gata',
    steps: [{ action: 'generate_quiz_topic', topic: 'subiectul discutat', questionsPerPack: 10 }],
  });
  const history = [
    { role: 'user' as const, content: 'explică-mi embolia pulmonară' },
    { role: 'assistant' as const, content: 'Embolia pulmonară apare prin obstrucția...' },
  ];

  it('rewrites a referential topic with the resolved subject', async () => {
    groqRequest.mockResolvedValueOnce(plan).mockResolvedValueOnce('embolia pulmonară');
    const result = await planAgentCommand('fa mi grile despre subiectul discutat', history);
    expect(result.isCommand).toBe(true);
    expect(result.steps[0].topic).toBe('embolia pulmonară');
  });

  it('drops the step instead of generating on a placeholder', async () => {
    groqRequest.mockResolvedValueOnce(plan).mockResolvedValueOnce('NONE');
    const result = await planAgentCommand('fa mi grile despre subiectul discutat', history);
    expect(result.steps).toHaveLength(0);
    expect(result.isCommand).toBe(false);
  });

  it('leaves a concrete topic alone and asks the model only once', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      isCommand: true,
      reply: 'Gata',
      steps: [{ action: 'generate_quiz_topic', topic: 'nefronul', questionsPerPack: 10 }],
    }));
    const result = await planAgentCommand('fa mi 10 grile despre nefron', history);
    expect(result.steps[0].topic).toBe('nefronul');
    expect(groqRequest).toHaveBeenCalledTimes(1);
  });
});

/**
 * "fă-mi un set de 30 de flashcarduri și pune-l în Bac" produced a chat answer
 * with a table of cards that were never saved: the planner had no action for
 * flashcards on a subject, only for flashcards from a library course.
 */
describe('flashcards on a subject', () => {
  beforeEach(() => groqRequest.mockReset());

  const history = [
    { role: 'user' as const, content: 'explică-mi cardiologia de examen' },
    { role: 'assistant' as const, content: 'Angina stabilă apare la efort...' },
  ];

  it('plans a real deck instead of answering in chat', async () => {
    groqRequest.mockResolvedValueOnce(JSON.stringify({
      isCommand: true,
      reply: 'Gata',
      steps: [{ action: 'create_flashcards_topic', topic: 'cardiologie', count: 30, folder: 'Bac' }],
    }));
    const result = await planAgentCommand('acum fa mi un set de 30 de flascarduri si sa l pui in bac', history);
    expect(result.isCommand).toBe(true);
    expect(result.steps[0]).toMatchObject({
      action: 'create_flashcards_topic',
      topic: 'cardiologie',
      count: 30,
      folder: 'Bac',
    });
  });

  it('resolves a referential subject from the conversation', async () => {
    groqRequest
      .mockResolvedValueOnce(JSON.stringify({
        isCommand: true,
        reply: 'Gata',
        steps: [{ action: 'create_flashcards_topic', topic: 'subiectul discutat', count: 30 }],
      }))
      .mockResolvedValueOnce('cardiologie');
    const result = await planAgentCommand('fa-mi 30 de flashcarduri din ce am discutat', history);
    expect(result.steps[0].topic).toBe('cardiologie');
  });

  it('describes the step for the plan card', () => {
    expect(describeStep({ action: 'create_flashcards_topic', topic: 'cardiologie', count: 30, folder: 'Bac' }))
      .toBe('Creez 30 flashcarduri despre „cardiologie" în „Bac"');
  });
});

describe('command detection for flashcards', () => {
  const commands = [
    'acum fa mi un set de 30 de flascarduri si sa l pui in bac',
    'fă-mi 20 de flashcarduri din cursul de cardiologie',
    'creează un deck de flash carduri',
    'vreau niște fișe de memorare',
  ];
  it.each(commands)('recognises %j', (text) => {
    expect(looksLikeAgentCommand(text)).toBe(true);
  });

  it('still ignores ordinary questions', () => {
    expect(looksLikeAgentCommand('ce este cardiologia intervențională?')).toBe(false);
  });
});
