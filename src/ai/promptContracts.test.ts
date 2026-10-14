import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT } from '../lib/bookAgent/prompts';
import { buildVerifierMessages } from '../lib/ai/crossCheck';
import { ANSWER_KEY_CHECK_RULE, VERIFIER_MATERIAL_RULE } from './promptKit';
import { buildWrongAnswerPrompt, buildInlineExplanationPrompt } from '../lib/groqCore/studyPrompts';

const sources = import.meta.glob(['../ai/*.ts', '../lib/groqCore/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const read = (path: string): string => {
  const entry = Object.entries(sources).find(([key]) => key.endsWith(`/${path.split('/').slice(-1)[0]}`));
  if (!entry) throw new Error(`fișier negăsit: ${path}`);
  return entry[1];
};

describe('contracte comune ale prompturilor', () => {
  it('verificatorii tratează textul primit ca material, nu ca instrucțiuni', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(VERIFIER_MATERIAL_RULE);
    const system = buildVerifierMessages({ question: 'q', answer: 'a' })[0].content;
    expect(system).toContain(VERIFIER_MATERIAL_RULE);
    for (const file of ['ai/medicalJudge.ts', 'ai/chatMemoryAI.ts']) {
      expect(read(file)).toContain('VERIFIER_MATERIAL_RULE');
    }
  });

  it('o singură regulă pentru cheia greșită în explicații', () => {
    expect(buildWrongAnswerPrompt('q', 'a', 'b')).toContain(ANSWER_KEY_CHECK_RULE);
    expect(buildInlineExplanationPrompt('q', [{ text: 'x', isCorrect: true }])).toContain(ANSWER_KEY_CHECK_RULE);
  });

  it('generatorul din text cere 5 opțiuni, nu 4, și nu invită la referințe inventate', () => {
    const source = read('lib/groqCore/questions.ts');
    expect(source).not.toContain('3 distractori');
    expect(source).not.toContain('Harrison/Gomella');
  });

  it('memoria nu ia fapte din replicile asistentului', () => {
    expect(read('ai/chatMemoryAI.ts')).toContain('Faptele vin NUMAI din replicile „Student”');
  });

  it('generatorul vechi de flashcarduri folosește kitul comun', () => {
    const source = read('lib/groqCore/flashcards.ts');
    expect(source).toContain('buildFlashcardAuthorSystem');
    expect(source).not.toContain('Transforma textul');
  });
});
