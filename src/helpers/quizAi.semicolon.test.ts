import { describe, expect, it } from 'vitest';
import { cleanQuestionExplanation, withoutSemicolons } from './quizAi';

describe('explicații fără „;”', () => {
  it('o propoziție întreagă după „;” devine propoziție nouă', () => {
    expect(cleanQuestionExplanation('Intoleranța GI este principala indicație pentru fer intravenos; celelalte situații nu sunt contraindicații exclusive.'))
      .toBe('Intoleranța GI este principala indicație pentru fer intravenos. Celelalte situații nu sunt contraindicații exclusive.');
  });

  it('o enumerare scurtă devine virgulă, iar fără „;” textul rămâne neschimbat', () => {
    expect(withoutSemicolons('Se dă oral; intravenos; intramuscular.')).toBe('Se dă oral, intravenos, intramuscular.');
    expect(withoutSemicolons('Fără semne speciale.')).toBe('Fără semne speciale.');
  });

  it('mai multe „;” într-o explicație', () => {
    expect(withoutSemicolons('Varianta A e corectă; varianta B nu tratează cauza; C e nepotrivită aici.'))
      .toBe('Varianta A e corectă. Varianta B nu tratează cauza. C e nepotrivită aici.');
  });
});
