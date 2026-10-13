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

  it('nu folosește drept subiect un mesaj-comandă („mai simplu”, „Continuă exact de unde ai rămas”)', () => {
    for (const prompt of ['mai simplu', 'da', 'Continuă exact de unde ai rămas, fără să repeți ce ai scris deja.']) {
      expect(buildAnswerQuizRequest(prompt, answer).subject, prompt).toBe('Artrita reumatoidă: schemă de tratament');
    }
    expect(buildAnswerQuizRequest('mai simplu', 'Text fără titlu despre gută și tratamentul ei acut').subject).toBe('Text fără titlu despre gută și tratamentul ei acut');
  });

  it('limitează lungimea materialului', () => {
    const { prefetchedContext } = buildAnswerQuizRequest('x', 'a'.repeat(20000));
    expect(prefetchedContext.summary.length).toBeLessThan(6300);
  });
});

describe('chatQuizTitle', () => {
  it('numește setul după subiect, cu majusculă și fără punctuația de la sfârșit', async () => {
    const { chatQuizTitle } = await import('./answerQuizRequest');
    expect(chatQuizTitle('tratamentul AR')).toBe('Tratamentul AR');
    expect(chatQuizTitle('Care este tratamentul anemiei feriprive?')).toBe('Care este tratamentul anemiei feriprive');
  });

  it('scurtează subiectele lungi la limită de cuvânt, cu „…”', async () => {
    const { chatQuizTitle } = await import('./answerQuizRequest');
    const title = chatQuizTitle('Explică-mi în detaliu fiziopatologia insuficienței cardiace congestive și tratamentul ei complet');
    expect(title.length).toBeLessThanOrEqual(53);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });

  it('fără subiect rămâne titlul vechi, cu data', async () => {
    const { chatQuizTitle } = await import('./answerQuizRequest');
    expect(chatQuizTitle('  ', new Date(2026, 9, 13))).toMatch(/^Test din chat · /);
  });
});
