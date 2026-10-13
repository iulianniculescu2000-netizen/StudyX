import { describe, expect, it } from 'vitest';
import { buildAnswerQuizRequest } from './answerQuizRequest';

describe('buildAnswerQuizRequest', () => {
  const answer = '## Artrita reumatoidă: schemă de tratament\n\n- Metotrexat 15 mg/săptămână\n- Anti-TNF la eșec';

  it('face din răspuns singurul material de referință, fără bucăți din bibliotecă', () => {
    const { prefetchedContext } = buildAnswerQuizRequest('fă-mi o schemă de tratament la AR', answer);
    expect(prefetchedContext.summary).toContain('Metotrexat 15 mg/săptămână');
    expect(prefetchedContext.chunks).toEqual([]);
    expect(prefetchedContext.weakTopics).toEqual([]);
  });

  it('numește subiectul din cerere și din titlul răspunsului, ca „AR” să nu rămână ambiguu', () => {
    const { subject } = buildAnswerQuizRequest('fă-mi o schemă de tratament la AR', answer);
    expect(subject).toContain('AR');
    expect(subject).toContain('Artrita reumatoidă');
  });

  it('nu dublează titlul când cererea îl conține deja', () => {
    const { subject } = buildAnswerQuizRequest('tratamentul artrita reumatoidă: schemă de tratament', answer);
    expect(subject.match(/Artrita reumatoidă/gi)).toHaveLength(1);
  });

  it('cade pe titlul răspunsului când nu există cerere, apoi pe începutul textului', () => {
    expect(buildAnswerQuizRequest('', answer).subject).toBe('Artrita reumatoidă: schemă de tratament');
    expect(buildAnswerQuizRequest('', 'Text fără titlu despre gută').subject).toBe('Text fără titlu despre gută');
  });

  it('limitează lungimea materialului', () => {
    const { prefetchedContext } = buildAnswerQuizRequest('x', 'a'.repeat(20000));
    expect(prefetchedContext.summary.length).toBeLessThan(6300);
  });
});
