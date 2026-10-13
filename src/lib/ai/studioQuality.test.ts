import { describe, expect, it } from 'vitest';
import { isStudioQuestionQualityAcceptable } from './studioGeneration';
import type { Question } from '../../types';

const question = (text: string, options: string[], correctIndex = 0): Question => ({
  id: 'q', text, difficulty: 'hard', explanation: 'x',
  options: options.map((option, i) => ({ id: `o${i}`, text: option, isCorrect: i === correctIndex })),
}) as Question;

const VIGNETTE = 'Pacient de 62 de ani, cu dureri precordiale de 40 de minute, transpirații, dispnee și hipotensiune (TA 80/50 mmHg), '
  + 'cu supradenivelare de segment ST în derivațiile V1-V4 pe ECG, ajunge în camera de gardă. Care este conduita cea mai potrivită în acest moment?';

describe('isStudioQuestionQualityAcceptable: vinietele și opțiunile scurte cerute de prompt', () => {
  it('acceptă o vinietă clinică lungă (nivel dificil), nu o înlocuiește cu un șablon', () => {
    expect(VIGNETTE.length).toBeGreaterThan(180);
    const q = question(VIGNETTE, ['Angioplastie coronariană primară', 'Fibrinoliză intravenoasă tardivă', 'Observație și repetarea ECG', 'Anticoagulare orală', 'Puncție pericardică']);
    expect(isStudioQuestionQualityAcceptable(q, 'Kumar')).toBe(true);
  });

  it('acceptă opțiuni de un singur cuvânt (medicamente, diagnostice)', () => {
    const q = question('Care medicament este de elecție în fibrilația atrială cu frecvență ventriculară rapidă și insuficiență cardiacă?', ['Amiodarona', 'Verapamil', 'Diltiazem', 'Propranolol', 'Nifedipina']);
    expect(isStudioQuestionQualityAcceptable(q, 'Kumar')).toBe(true);
  });

  it('respinge în continuare un enunț prea lung, o opțiune goală sau prea scurtă și un răspuns copiat în enunț', () => {
    const options = ['Prima variantă', 'A doua variantă', 'A treia variantă', 'A patra variantă', 'A cincea variantă'];
    expect(isStudioQuestionQualityAcceptable(question('x'.repeat(400), options), 'Kumar')).toBe(false);
    expect(isStudioQuestionQualityAcceptable(question('Care este varianta corectă pentru acest caz clinic?', ['Da', 'A doua variantă', 'A treia variantă', 'A patra variantă', 'A cincea variantă']), 'Kumar')).toBe(false);
    expect(isStudioQuestionQualityAcceptable(question('Care este varianta corectă: Prima variantă pentru acest caz?', options), 'Kumar')).toBe(false);
  });
});
