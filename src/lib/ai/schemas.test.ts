import { describe, expect, it } from 'vitest';
import {
  AgentPlanSchema,
  AnalysisResultSchema,
  AnswerVerdictSchema,
  MemoryExtractionSchema,
  QuestionsBatchSchema,
  VerificationResultSchema,
  FlashcardsBatchSchema,
  flashcardsBatchSchema,
  parseStructuredReply,
} from './schemas';
import { parseJsonLoose } from '../jsonExtract';

const goodQuestion = {
  text: 'Care este tratamentul de primă linie al anafilaxiei?',
  options: [
    { text: 'Adrenalină i.m.', isCorrect: true },
    { text: 'Antihistaminic oral', isCorrect: false },
    { text: 'Corticoid oral', isCorrect: false },
  ],
  explanation: 'Adrenalina este prima linie.',
  tags: ['alergologie'],
  difficulty: 'medium',
};

const FENCE = '```';

describe('parseJsonLoose', () => {
  it('reads fenced JSON with chatter around it', () => {
    const raw = `Sigur! Iată {desigur} rezultatul:\n${FENCE}json\n{"a":1}\n${FENCE}\nSper că ajută.`;
    expect(parseJsonLoose(raw)?.value).toEqual({ a: 1 });
  });
  it('ignores a <think> block', () => {
    expect(parseJsonLoose('<think>trebuie {"x":0}</think>{"a":2}')?.value).toEqual({ a: 2 });
  });
  it('keeps the complete questions of a truncated {questions:[…]} instead of one inner object', () => {
    const raw = '{"questions":[{"text":"Q1 lung?","options":[{"text":"a","isCorrect":true},{"text":"b","isCorrect":false}]},{"text":"Q2 lung?","options":[{"text":"a","isCorrect":false},{"text":"b","isCorrect":true}]},{"text":"Q3 tăi';
    const loose = parseJsonLoose(raw);
    expect(loose?.truncated).toBe(true);
    expect(Array.isArray(loose?.value) ? (loose?.value as unknown[]).length : -1).toBe(2);
  });
  it('closes a truncated flat object', () => {
    const loose = parseJsonLoose('{"explanation":"Fiindcă mecanismul","mistakeType":"conceptual","rule":"Reține că');
    expect(loose?.truncated).toBe(true);
    expect((loose?.value as { explanation: string }).explanation).toBe('Fiindcă mecanismul');
  });
  it('returns null for prose and tolerates trailing commas', () => {
    expect(parseJsonLoose('Nu pot ajuta cu asta.')).toBeNull();
    expect(parseJsonLoose('{"a":[1,2,],}')?.value).toEqual({ a: [1, 2] });
  });
});

describe('QuestionsBatchSchema', () => {
  it('accepts the canonical shape', () => {
    const result = parseStructuredReply(JSON.stringify({ questions: [goodQuestion] }), QuestionsBatchSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.questions[0].difficulty).toBe('medium');
      expect(result.data.dropped).toBe(0);
    }
  });

  it('accepts a bare array and a lone object', () => {
    expect(parseStructuredReply(JSON.stringify([goodQuestion]), QuestionsBatchSchema).ok).toBe(true);
    expect(parseStructuredReply(JSON.stringify(goodQuestion), QuestionsBatchSchema).ok).toBe(true);
  });

  it('fills safe defaults for missing optional fields', () => {
    const bare = { text: goodQuestion.text, options: goodQuestion.options };
    const result = parseStructuredReply(JSON.stringify({ questions: [bare] }), QuestionsBatchSchema);
    expect(result.ok && result.data.questions[0].explanation).toBe('');
    expect(result.ok && result.data.questions[0].tags).toBeUndefined();
  });

  it('derives isCorrect from a letter ("B"), several letters, or an index', () => {
    const base = { text: 'Întrebare suficient de lungă?', options: ['A) unu', 'B) doi', 'C) trei'] };
    const letter = parseStructuredReply(JSON.stringify({ questions: [{ ...base, correctAnswer: 'B' }] }), QuestionsBatchSchema);
    expect(letter.ok && letter.data.questions[0].options.map((o) => o.isCorrect)).toEqual([false, true, false]);
    expect(letter.ok && letter.data.questions[0].options[0].text).toBe('unu');

    const multi = parseStructuredReply(JSON.stringify({ questions: [{ ...base, correct: 'A, C' }] }), QuestionsBatchSchema);
    expect(multi.ok && multi.data.questions[0].options.map((o) => o.isCorrect)).toEqual([true, false, true]);

    const index = parseStructuredReply(JSON.stringify({ questions: [{ ...base, correctIndex: 2 }] }), QuestionsBatchSchema);
    expect(index.ok && index.data.questions[0].options.map((o) => o.isCorrect)).toEqual([false, false, true]);
  });

  it('coerces string booleans and difficulty aliases', () => {
    const q = { ...goodQuestion, difficulty: 'dificil', options: goodQuestion.options.map((o) => ({ ...o, isCorrect: o.isCorrect ? 'true' : 'false' })) };
    const result = parseStructuredReply(JSON.stringify({ questions: [q] }), QuestionsBatchSchema);
    expect(result.ok && result.data.questions[0].difficulty).toBe('hard');
    expect(result.ok && result.data.questions[0].options[0].isCorrect).toBe(true);
  });

  it('drops invalid elements one by one and keeps the rest', () => {
    const noCorrect = { ...goodQuestion, options: goodQuestion.options.map((o) => ({ ...o, isCorrect: false })) };
    const batch = { questions: [goodQuestion, { text: 'Fără variante deloc?' }, noCorrect, goodQuestion] };
    const result = parseStructuredReply(JSON.stringify(batch), QuestionsBatchSchema);
    expect(result.ok && result.data.questions).toHaveLength(2);
    expect(result.ok && result.data.dropped).toBe(2);
  });

  it('fails with a readable message when nothing is usable', () => {
    const result = parseStructuredReply(JSON.stringify({ questions: [{ text: 'x' }] }), QuestionsBatchSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/niciun element valid/);
  });

  it('survives a truncated reply and code fences', () => {
    const q = JSON.stringify(goodQuestion);
    const raw = `${FENCE}json\n{"questions":[${q},${q},{"text":"tăiat la mij`;
    const result = parseStructuredReply(raw, QuestionsBatchSchema);
    expect(result.ok && result.data.questions).toHaveLength(2);
  });

  it('rejects prose and an object that is not a batch', () => {
    expect(parseStructuredReply('Îmi pare rău, nu pot.', QuestionsBatchSchema).ok).toBe(false);
    expect(parseStructuredReply('{"foo":"bar","baz":1}', QuestionsBatchSchema).ok).toBe(false);
  });
});

describe('FlashcardsBatchSchema', () => {
  it('reads {cards}, a bare array and aliases; drops incomplete cards', () => {
    const wrapped = parseStructuredReply('{"cards":[{"front":"Ce e HTA?","back":"Tensiune mare"},{"front":"fără spate"},{"question":"Q?","answer":"R"}]}', FlashcardsBatchSchema);
    expect(wrapped.ok && wrapped.data.cards).toEqual([
      { front: 'Ce e HTA?', back: 'Tensiune mare' },
      { front: 'Q?', back: 'R' },
    ]);
    expect(wrapped.ok && wrapped.data.dropped).toBe(1);
    expect(parseStructuredReply('[{"front":"a1","back":"b1"}]', FlashcardsBatchSchema).ok).toBe(true);
  });
  it('can accept an honest empty list when min is 0', () => {
    expect(parseStructuredReply('{"cards":[]}', flashcardsBatchSchema(0)).ok).toBe(true);
    expect(parseStructuredReply('{"cards":[]}', FlashcardsBatchSchema).ok).toBe(false);
  });
});

describe('MemoryExtractionSchema and VerificationResultSchema', () => {
  it('keeps valid memory kinds, drops unknown ones, accepts an empty list', () => {
    const result = parseStructuredReply('{"items":[{"kind":"Goal","text":"Se pregătește pentru rezidențiat"},{"kind":"hobby","text":"x"}]}', MemoryExtractionSchema);
    expect(result.ok && result.data.items).toEqual([{ kind: 'goal', text: 'Se pregătește pentru rezidențiat' }]);
    expect(parseStructuredReply('{"items":[]}', MemoryExtractionSchema).ok).toBe(true);
  });
  it('reads verification issues', () => {
    const result = parseStructuredReply('{"issues":[{"claim":"doza 5 mg","reason":"e 50 mg"},{"claim":""}]}', VerificationResultSchema);
    expect(result.ok && result.data.issues).toHaveLength(1);
    expect(parseStructuredReply('{"issues":[]}', VerificationResultSchema).ok).toBe(true);
  });
});

describe('AnalysisResultSchema and AnswerVerdictSchema', () => {
  it('needs only the explanation; coerces confidence and lists', () => {
    const result = parseStructuredReply('{"explanation":"Mecanismul e altul","confidence":"85","relatedConcepts":"HTA, DZ"}', AnalysisResultSchema);
    expect(result.ok && result.data.confidence).toBeCloseTo(0.85);
    expect(result.ok && result.data.relatedConcepts).toEqual(['HTA', 'DZ']);
    expect(result.ok && result.data.rule).toBe('');
    expect(parseStructuredReply('{"rule":"x"}', AnalysisResultSchema).ok).toBe(false);
  });
  it('reads the dispute verdict', () => {
    const result = parseStructuredReply('{"agrees":"da","correctLetters":"a, c","reasoning":"..."}', AnswerVerdictSchema);
    expect(result.ok && result.data).toEqual({ agrees: true, correctLetters: ['a', 'c'], reasoning: '...' });
    expect(parseStructuredReply('{"correctLetters":["a"]}', AnswerVerdictSchema).ok).toBe(false);
  });
});

describe('AgentPlanSchema', () => {
  it('normalises steps: aliases, string numbers, unknown enum values', () => {
    const raw = JSON.stringify({
      isCommand: true,
      reply: 'Fac asta',
      steps: [{ action: 'Generate_Quiz_Pack', source: 'Cardio', packs: '2', questions: '15', question_type: 'multiple', exam_style: 'weird' }],
    });
    const result = parseStructuredReply(raw, AgentPlanSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.isCommand).toBe(true);
      expect(result.data.steps[0]).toMatchObject({ action: 'generate_quiz_pack', packCount: 2, questionsPerPack: 15, questionType: 'multiple' });
      expect(result.data.steps[0].examStyle).toBeUndefined();
    }
  });
  it('drops steps with unknown actions without losing the others', () => {
    const result = parseStructuredReply('{"isCommand":true,"steps":[{"action":"format_disk"},{"action":"create_folder","name":"X"}]}', AgentPlanSchema);
    expect(result.ok && result.data.steps).toHaveLength(1);
    expect(result.ok && result.data.droppedSteps).toBe(1);
  });
  it('is not a command when no step survives; fails when a command has only bad steps', () => {
    const none = parseStructuredReply('{"isCommand":false,"reply":"Salut","steps":[]}', AgentPlanSchema);
    expect(none.ok && none.data.isCommand).toBe(false);
    expect(parseStructuredReply('{"isCommand":true,"steps":[{"action":"nope"}]}', AgentPlanSchema).ok).toBe(false);
  });
  it('accepts a bare array of steps and rejects unrelated objects', () => {
    const arr = parseStructuredReply('[{"action":"delete_quiz","quiz":"Q"}]', AgentPlanSchema);
    expect(arr.ok && arr.data.isCommand).toBe(true);
    expect(parseStructuredReply('{"hello":"world"}', AgentPlanSchema).ok).toBe(false);
  });
});
