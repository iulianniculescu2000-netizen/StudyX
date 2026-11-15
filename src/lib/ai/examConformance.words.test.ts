/**
 * Metricile în cuvinte (mediana enunțului, dispersia variantelor, cheia față de distractori, semne de „generat”,
 * amestecul CM), măsurate pe cele 1200 de grile reale, adăugate la scorul de conformitate doar la rezidențiat.
 */
import { describe, expect, it } from 'vitest';
import { formatConformanceReport, scoreExamConformance } from './examConformance';
import { QUESTION_EXEMPLARS } from '../../data/questionExemplars';
import type { Question } from '../../types';

function q(stem: string, options: string[], correct: number[] = [0]): Question {
  return {
    id: Math.random().toString(36).slice(2),
    text: stem,
    multipleCorrect: correct.length > 1,
    difficulty: 'medium',
    explanation: '',
    options: options.map((text, i) => ({ id: String(i), text, isCorrect: correct.includes(i) })),
  };
}
const metric = (questions: Question[], id: string) => scoreExamConformance(questions, 'residency').metrics.find((m) => m.id === id);

const realShaped = [
  q('Agentul etiologic al sifilisului este:', ['Neisseria gonorrhoeae', 'Treponema pallidum', 'Chlamydia trachomatis', 'Haemophilus ducreyi', 'Klebsiella granulomatis'], [1]),
  q('Boala cronică de rinichi stadiul G4 are RFG de:', ['peste 90 mL/min', '60–89 mL/min', '30–44 mL/min', '15–29 mL/min', 'sub 15 mL/min'], [3]),
  q('Despre astmul bronșic sunt adevărate afirmațiile:', ['obstrucția este reversibilă', 'inflamația cronică este centrală', 'corticosteroizii inhalatori sunt tratamentul de fond cu administrare zilnică', 'apare numai la copii', 'nu are componentă alergică'], [0, 1, 2]),
];

describe('metricile în cuvinte', () => {
  it('un lot în forma examenului trece toate cele patru', () => {
    for (const id of ['stemWords', 'optionSpread', 'keyGap', 'formErrors']) expect(metric(realShaped, id)?.ok, id).toBe(true);
  });

  it('exemplarele din aplicație, scrise pe forma examenului, nu pică la semnele sigure de „generat”', () => {
    const exemplars: Question[] = QUESTION_EXEMPLARS.filter((e) => e.style === 'residency').map((e) =>
      q(e.stem, e.options, e.correct),
    );
    expect(metric(exemplars, 'formErrors')?.ok).toBe(true);
    expect(metric(exemplars, 'stemWords')?.ok).toBe(true);
  });

  it('prinde enunțul-paragraf, variantele de aceeași lungime și trimiterile la sursă', () => {
    const wordy = Array.from({ length: 30 }, () => 'cuvânt').join(' ');
    expect(metric([q(wordy, ['a', 'b', 'c', 'd', 'e'])], 'stemWords')?.ok).toBe(false);
    const uniform = [q('Tratamentul indicat este:', ['administrarea de aspirină', 'administrarea de heparină', 'administrarea de warfarină', 'administrarea de clopidogrel', 'administrarea de ticagrelor'])];
    expect(metric(uniform, 'optionSpread')?.ok).toBe(false);
    const meta = [q('Conform cursului, tratamentul este:', ['a', 'b', 'c', 'd', 'e'])];
    expect(metric(meta, 'formErrors')?.ok).toBe(false);
  });

  it('cheia mult mai lungă decât distractorii e semnalată', () => {
    const long = Array.from({ length: 8 }, () => 'cuvânt').join(' ');
    expect(metric([q('Alegeți răspunsul:', [long, 'unu', 'doi', 'trei', 'patru'])], 'keyGap')?.ok).toBe(false);
  });

  it('amestecul CM se judecă doar de la 5 grile CM; un lot numai cu 3 corecte pică', () => {
    const three = Array.from({ length: 6 }, () => q('Afirmații adevărate:', ['a', 'b', 'c', 'd', 'e'], [0, 1, 2]));
    expect(metric(three, 'cmMix')?.ok).toBe(false);
    expect(metric(three.slice(0, 4), 'cmMix')).toBeUndefined();
    const mixed = [2, 3, 3, 4, 2, 3].map((n) => q('Afirmații adevărate:', ['a', 'b', 'c', 'd', 'e'], Array.from({ length: n }, (_, i) => i)));
    expect(metric(mixed, 'cmMix')?.ok).toBe(true);
  });

  it('pista simplă nu primește metricile noi', () => {
    const ids = scoreExamConformance(realShaped, 'simple').metrics.map((m) => m.id);
    expect(ids).not.toContain('stemWords');
    expect(ids).not.toContain('formErrors');
  });

  it('raportul text afișează valorile în unitatea lor', () => {
    const text = formatConformanceReport(scoreExamConformance(realShaped, 'residency'));
    expect(text).toContain('cuv.');
    expect(text).toContain('Dispersia lungimii variantelor');
  });
});
