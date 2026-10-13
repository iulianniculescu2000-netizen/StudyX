import { describe, expect, it } from 'vitest';
import { buildQuestionPrompt } from './prompts';
import { buildStudioContextPayload } from '../lib/ai/studioGeneration';
import type { UserProfileData, WeakTopic } from './types';

const profile = {
  profileId: 'p', currentDifficulty: 'medium', globalAccuracy: 60, streak: 2,
  mistakeBank: [{ id: '1', questionId: 'q', questionText: 'x', topic: 'Aritmii', userAnswer: 'a', correctAnswer: 'b', createdAt: 0, wrongCount: 4 }],
} as unknown as UserProfileData;
const weak: WeakTopic[] = [{ topic: 'Aritmii', accuracy: 20, wrongCount: 8, total: 10, recencyScore: 0 }];
const ctx = { query: 'AR', summary: 'Artrita reumatoidă: metotrexat.' };

describe('buildQuestionPrompt cu subiect obligatoriu', () => {
  it('fără subiect rămâne personalizat: topicuri slabe și greșeli frecvente', () => {
    const prompt = buildQuestionPrompt(profile, weak, 'medium', ctx);
    expect(prompt).toContain('TOPICURI SLABE DE PRIORITIZAT: "Aritmii"');
    expect(prompt).toContain('GREȘELI FRECVENTE');
    expect(prompt).not.toContain('SUBIECT OBLIGATORIU');
  });

  it('cu subiect taie topicurile slabe și greșelile, și pune regula înainte și după context', () => {
    const prompt = buildQuestionPrompt(profile, weak, 'medium', ctx, 'single', undefined, 5, undefined, 'tratament AR (Artrita reumatoidă)');
    expect(prompt).not.toContain('Aritmii');
    expect(prompt).not.toContain('GREȘELI FRECVENTE');
    expect(prompt).not.toContain('TOPICURI SLABE');
    const rule = 'SUBIECT OBLIGATORIU: „tratament AR (Artrita reumatoidă)”';
    const first = prompt.indexOf(rule);
    const context = prompt.indexOf('CONTEXT DIN BIBLIOTECA');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(context);
    expect(prompt.lastIndexOf(rule)).toBeGreaterThan(context);
  });
});

describe('buildStudioContextPayload', () => {
  const chunks = [{ source: 'Curs', topic: 'Artrita reumatoidă', text: 'Metotrexat, anti-TNF.', difficulty: 'medium', score: 1 }] as never;
  const base = { sourceName: 'Curs', chunks, packIndex: 0, totalPacks: 1, difficulty: 'medium' as const };

  it('păstrează doar punctele slabe din fragmentele alese', () => {
    const related: WeakTopic = { topic: 'artrita reumatoidă', accuracy: 30, wrongCount: 5, total: 7, recencyScore: 0 };
    const payload = buildStudioContextPayload({ ...base, weakTopics: [...weak, related] });
    expect(payload.summary).toContain('Puncte slabe ale utilizatorului de urmărit: artrita reumatoidă.');
    expect(payload.summary).not.toContain('Aritmii');
  });

  it('nu adaugă rândul de puncte slabe când niciunul nu ține de fragmente', () => {
    expect(buildStudioContextPayload({ ...base, weakTopics: weak }).summary).not.toContain('Puncte slabe');
  });
});
