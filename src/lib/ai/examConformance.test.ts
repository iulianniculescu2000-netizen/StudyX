/**
 * The scorer is the yardstick for "did generation get better", so it has to be
 * right in both directions: exam-shaped sets must score high, and the shapes we
 * were producing before calibration (four options, long vignettes, no
 * colon-completed stems) must score low.
 */
import { describe, expect, it } from 'vitest';
import { formatConformanceReport, scoreExamConformance } from './examConformance';
import { QUESTION_EXEMPLARS } from '../../data/questionExemplars';
import type { ExamStyle } from './examStyle';
import type { Question } from '../../types';

function question(stem: string, optionTexts: string[], correct = 0): Question {
  return {
    id: Math.random().toString(36).slice(2),
    text: stem,
    multipleCorrect: false,
    difficulty: 'medium',
    explanation: '',
    options: optionTexts.map((text, index) => ({
      id: String(index),
      text,
      isCorrect: index === correct,
    })),
  };
}

/** A batch shaped like the official paper. */
function examShapedSet(): Question[] {
  return [
    question('Agentul etiologic al sifilisului este:', [
      'Neisseria gonorrhoeae', 'Treponema pallidum', 'Chlamydia trachomatis', 'Haemophilus ducreyi', 'Klebsiella granulomatis',
    ], 1),
    question('Segmentul tubului digestiv afectat în colita ulcerativă este:', [
      'rectul', 'esofagul', 'stomacul', 'duodenul', 'jejunul',
    ]),
    question('Despre astmul bronșic, o singură afirmație este incorectă:', [
      'obstrucția este tipic reversibilă', 'inflamația cronică este centrală',
      'corticosteroizii inhalatori sunt tratamentul de fond', 'hiperreactivitatea poate fi obiectivată',
      'evoluția are obstrucție complet ireversibilă',
    ], 4),
    question('Stadiul G4 de boală cronică de rinichi (BCR) corespunde unei filtrări glomerulare de:', [
      'peste 90 mL/min/1,73 m²', '60–89 mL/min/1,73 m²', '30–44 mL/min/1,73 m²', '15–29 mL/min/1,73 m²', 'sub 15 mL/min/1,73 m²',
    ], 3),
    // Not every stem is colon-completed at the exam either; the mix matters.
    question('Care dintre următoarele afirmații privind endocardita infecțioasă este adevărată?', [
      'hemoculturile se recoltează numai după inițierea antibioterapiei',
      'vegetațiile valvulare pot fi evidențiate ecocardiografic',
      'febra lipsește în majoritatea cazurilor documentate',
      'criteriile Duke modificate nu includ criterii microbiologice',
      'profilaxia antibiotică se recomandă la toți pacienții valvulari',
    ], 1),
  ];
}

/** What the app produced before the calibration: four options, wordy vignettes. */
function preCalibrationSet(): Question[] {
  const vignette = 'Un pacient de 54 de ani se prezintă la camera de gardă acuzând dispnee progresivă instalată în ultimele trei săptămâni, edeme gambiere bilaterale și fatigabilitate marcată la eforturi mici. Ce diagnostic este cel mai probabil?';
  return [
    question(vignette, [
      'insuficiență cardiacă congestivă cu fracție de ejecție redusă, confirmată ecocardiografic',
      'pneumonie comunitară cu revărsat pleural asociat și sindrom inflamator marcat',
      'bronhopneumopatie obstructivă cronică acutizată infecțios la un fost fumător',
      'embolie pulmonară acută cu instabilitate hemodinamică și dilatare de ventricul drept',
    ]),
    question(vignette.replace('54', '61'), [
      'sindrom nefrotic cu hipoalbuminemie severă și proteinurie peste trei grame pe zi',
      'ciroză hepatică decompensată vascular, cu ascită voluminoasă și circulație colaterală',
      'insuficiență cardiacă cu fracție de ejecție păstrată la un pacient hipertensiv vechi',
      'tromboză venoasă profundă bilaterală cu sindrom posttrombotic instalat rapid',
    ]),
  ];
}

describe('scoring against the real exam shape', () => {
  it('gives an exam-shaped batch a high score', () => {
    const report = scoreExamConformance(examShapedSet(), 'residency');
    expect(report.score).toBeGreaterThanOrEqual(83);
    expect(report.metrics.find((metric) => metric.id === 'optionCount')?.ok).toBe(true);
    expect(report.metrics.find((metric) => metric.id === 'colonStems')?.ok).toBe(true);
  });

  it('fails the shapes produced before calibration', () => {
    const report = scoreExamConformance(preCalibrationSet(), 'residency');
    expect(report.score).toBeLessThanOrEqual(34);
    const failed = report.metrics.filter((metric) => !metric.ok).map((metric) => metric.id);
    expect(failed).toContain('optionCount');
    expect(failed).toContain('vignettes');
    expect(failed).toContain('stemLength');
  });

  it('judges the plain track by its own targets', () => {
    const simple = [
      question('Unitatea structurală și funcțională a rinichiului este:', ['nefronul', 'glomerulul', 'tubul colector', 'capsula Bowman']),
      question('Care este rolul principal al hemoglobinei:', ['transportul oxigenului', 'coagularea sângelui', 'apărarea antiinfecțioasă', 'reglarea glicemiei']),
    ];
    expect(scoreExamConformance(simple, 'simple').score).toBeGreaterThanOrEqual(83);
    // The same four-option set is wrong for the residency track.
    expect(scoreExamConformance(simple, 'residency').metrics.find((m) => m.id === 'optionCount')?.ok).toBe(false);
  });

  it('counts complement multiplu as five options in both tracks', () => {
    const multi = question('Care dintre următoarele afirmații sunt adevărate:', ['a', 'b', 'c', 'd', 'e']);
    multi.multipleCorrect = true;
    multi.options[1].isCorrect = true;
    expect(scoreExamConformance([multi], 'simple').metrics.find((m) => m.id === 'optionCount')?.ok).toBe(true);
  });

  it('reports nothing for an empty batch instead of dividing by zero', () => {
    const report = scoreExamConformance([], 'residency');
    expect(report.score).toBe(0);
    expect(report.questions).toBe(0);
    expect(Number.isNaN(report.metrics[0].value)).toBe(false);
  });

  it('formats a readable report with the failing metrics explained', () => {
    const text = formatConformanceReport(scoreExamConformance(preCalibrationSet(), 'residency'));
    expect(text).toContain('Conformitate cu examenul');
    expect(text).toContain('✗');
    expect(text).toContain('→');
  });
});

describe('built-in exemplars follow their own rules', () => {
  it.each(['residency', 'simple'] as ExamStyle[])('%s exemplars have the right option count', (style) => {
    const asQuestions = QUESTION_EXEMPLARS
      .filter((exemplar) => exemplar.style === style)
      .map((exemplar) => {
        const q = question(exemplar.stem, exemplar.options, exemplar.correct[0]);
        exemplar.correct.forEach((index) => { q.options[index].isCorrect = true; });
        q.multipleCorrect = exemplar.correct.length > 1;
        return q;
      });

    const report = scoreExamConformance(asQuestions, style);
    expect(report.metrics.find((metric) => metric.id === 'optionCount')?.ok).toBe(true);
  });

  it('never marks zero correct answers', () => {
    for (const exemplar of QUESTION_EXEMPLARS) {
      expect(exemplar.correct.length).toBeGreaterThan(0);
      expect(Math.max(...exemplar.correct)).toBeLessThan(exemplar.options.length);
    }
  });
});
