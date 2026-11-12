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

describe('explicații pe mai multe rânduri (șablonul „set de antrenament”)', () => {
  it('păstrează rândurile și aplică regula fără „;” pe fiecare rând', () => {
    const text = 'A – adevărat. «O reducere»\nB – fals. în sarcină volumul crește puțin; anemia falsă vine din creșterea volumului plasmatic\n\nSursa: Kumar, p. 350';
    expect(cleanQuestionExplanation(text)).toBe(
      'A – adevărat. «O reducere»\nB – fals. în sarcină volumul crește puțin. Anemia falsă vine din creșterea volumului plasmatic\nSursa: Kumar, p. 350',
    );
  });

  it('o explicație pe un singur rând rămâne neschimbată ca înainte', () => {
    expect(cleanQuestionExplanation('Un singur   rând.')).toBe('Un singur rând.');
  });
});
