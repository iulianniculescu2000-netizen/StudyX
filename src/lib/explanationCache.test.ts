import { beforeEach, describe, expect, it } from 'vitest';
import { EXPLANATION_CACHE_LIMIT, explanationKey, loadExplanation, saveExplanation } from './explanationCache';
import type { AIAnalysisResult } from '../ai/types';

const question = {
  id: 'q1',
  text: 'Tratamentul de fond în poliartrita reumatoidă este:',
  options: [
    { id: 'a', text: 'Metotrexat', isCorrect: true },
    { id: 'b', text: 'Paracetamol', isCorrect: false },
  ],
};
const analysis = (explanation: string): AIAnalysisResult => ({ explanation, mistakeType: 'x', rule: 'r', confidence: 0.8 });

describe('explicațiile păstrate pe grilă', () => {
  beforeEach(() => localStorage.clear());

  it('aceeași grilă cu același răspuns primește explicația salvată, pe profilul ei', () => {
    const key = explanationKey(question, 'Paracetamol');
    saveExplanation('p1', key, analysis('De ce metotrexat [1].'));
    expect(loadExplanation('p1', key)?.explanation).toBe('De ce metotrexat [1].');
    expect(loadExplanation('p2', key)).toBeNull();
  });

  it('alt răspuns sau grilă editată înseamnă altă cheie', () => {
    const key = explanationKey(question, 'Paracetamol');
    expect(explanationKey(question, 'Metotrexat')).not.toBe(key);
    expect(explanationKey({ ...question, text: `${question.text} (editat)` }, 'Paracetamol')).not.toBe(key);
    const flipped = { ...question, options: question.options.map((option) => ({ ...option, isCorrect: !option.isCorrect })) };
    expect(explanationKey(flipped, 'Paracetamol')).not.toBe(key);
  });

  it('ține cel mult plafonul; cele mai vechi ies primele', () => {
    for (let i = 0; i < EXPLANATION_CACHE_LIMIT + 5; i += 1) saveExplanation('p1', `k${i}`, analysis(`e${i}`), i);
    expect(loadExplanation('p1', 'k0')).toBeNull();
    expect(loadExplanation('p1', `k${EXPLANATION_CACHE_LIMIT + 4}`)?.explanation).toBe(`e${EXPLANATION_CACHE_LIMIT + 4}`);
  });

  it('o explicație goală nu se salvează, iar o stocare stricată nu aruncă', () => {
    saveExplanation('p1', 'gol', analysis('  '));
    expect(loadExplanation('p1', 'gol')).toBeNull();
    localStorage.setItem('studyx-p-p1-ai-explanations', '{stricat');
    expect(loadExplanation('p1', 'gol')).toBeNull();
  });
});
