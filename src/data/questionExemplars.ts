/**
 * Style anchors for question generation.
 *
 * Prose rules only get a model so far — it will follow "keep the stem short"
 * and still write a five-line vignette. Showing it two or three questions in
 * the target shape moves the output much closer, because the model copies form
 * from examples far more reliably than from instructions.
 *
 * These are written in-house, modelled on the structures measured in the
 * official rezidențiat papers and Romanian question banks (five options A–E,
 * colon-terminated stems, single-category distractors, expanded abbreviations,
 * the occasional negative stem). The medical content is standard textbook
 * material — nothing is copied from any collection, so the app can ship them.
 */
import type { ExamStyle } from '../lib/ai/examStyle';

export type ExemplarShape =
  /** Stem ends in a colon and the options complete it. */
  | 'completion'
  /** "Referitor la X este adevărat că:" — options are full statements. */
  | 'statement'
  /** "NU", "cu excepția", "o singură afirmație este incorectă". */
  | 'negative'
  /** Thresholds, stages, lab values. */
  | 'threshold';

export interface QuestionExemplar {
  style: ExamStyle;
  type: 'single' | 'multiple';
  shape: ExemplarShape;
  stem: string;
  options: string[];
  /** Index of the correct option, or indices for complement multiplu. */
  correct: number[];
}

export const QUESTION_EXEMPLARS: QuestionExemplar[] = [
  {
    style: 'residency',
    type: 'single',
    shape: 'completion',
    stem: 'Agentul etiologic al sifilisului este:',
    options: [
      'Neisseria gonorrhoeae',
      'Treponema pallidum',
      'Chlamydia trachomatis',
      'Haemophilus ducreyi',
      'Klebsiella granulomatis',
    ],
    correct: [1],
  },
  {
    style: 'residency',
    type: 'single',
    shape: 'threshold',
    stem: 'Stadiul G4 de boală cronică de rinichi (BCR), conform clasificării KDIGO, corespunde unei rate de filtrare glomerulare (RFG) de:',
    options: [
      'peste 90 mL/min/1,73 m²',
      '60–89 mL/min/1,73 m²',
      '30–44 mL/min/1,73 m²',
      '15–29 mL/min/1,73 m²',
      'sub 15 mL/min/1,73 m²',
    ],
    correct: [3],
  },
  {
    style: 'residency',
    type: 'single',
    shape: 'statement',
    stem: 'Referitor la tratamentul anticoagulant din tromboembolismul venos (TEV) este adevărat că:',
    options: [
      'heparina cu greutate moleculară mică necesită monitorizarea timpului de protrombină',
      'anticoagulantele orale directe se administrează fără monitorizare de rutină a coagulării',
      'warfarina se poate iniția fără suprapunere cu un anticoagulant parenteral',
      'durata standard a tratamentului este de două săptămâni',
      'anticoagularea este contraindicată în tromboza venoasă profundă proximală',
    ],
    correct: [1],
  },
  {
    style: 'residency',
    type: 'single',
    shape: 'negative',
    stem: 'Despre astmul bronșic, o singură afirmație este incorectă:',
    options: [
      'obstrucția bronșică este tipic reversibilă',
      'inflamația cronică a căilor aeriene este elementul central',
      'corticosteroizii inhalatori reprezintă tratamentul de fond',
      'hiperreactivitatea bronșică poate fi obiectivată prin test de provocare',
      'evoluția se caracterizează prin obstrucție fixă, complet ireversibilă',
    ],
    correct: [4],
  },
  {
    style: 'residency',
    type: 'multiple',
    shape: 'statement',
    stem: 'Care dintre următoarele afirmații privind pancreatita acută sunt adevărate:',
    options: [
      'litiaza biliară și consumul de alcool sunt cauzele cele mai frecvente',
      'diagnosticul necesită obligatoriu confirmare prin tomografie computerizată',
      'amilaza și lipaza serică crescute susțin diagnosticul',
      'reechilibrarea volemică precoce influențează prognosticul',
      'antibioterapia profilactică este indicată la toți pacienții',
    ],
    correct: [0, 2, 3],
  },
  {
    style: 'simple',
    type: 'single',
    shape: 'completion',
    stem: 'Unitatea structurală și funcțională a rinichiului este:',
    options: ['nefronul', 'glomerulul', 'tubul colector', 'capsula Bowman'],
    correct: [0],
  },
  {
    style: 'simple',
    type: 'single',
    shape: 'statement',
    stem: 'Care este rolul principal al hemoglobinei:',
    options: [
      'transportul oxigenului',
      'coagularea sângelui',
      'apărarea împotriva infecțiilor',
      'reglarea glicemiei',
    ],
    correct: [0],
  },
];

function renderExemplar(exemplar: QuestionExemplar): string {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const options = exemplar.options
    .map((text, index) => `${letters[index]}. ${text}${exemplar.correct.includes(index) ? '  ← corect' : ''}`)
    .join('\n');
  return `${exemplar.stem}\n${options}`;
}

/**
 * Two or three anchors matching the requested track and answer type, varied by
 * shape so the model doesn't copy a single template for the whole batch.
 */
export function buildExemplarBlock(style: ExamStyle, type: 'single' | 'multiple'): string {
  const pool = QUESTION_EXEMPLARS.filter((item) => item.style === style && item.type === type);
  const fallback = QUESTION_EXEMPLARS.filter((item) => item.style === style);
  const chosen = (pool.length > 0 ? pool : fallback).slice(0, 3);
  if (chosen.length === 0) return '';

  return [
    'EXEMPLE DE FORMĂ (copiază structura, nu conținutul — generează despre tema cerută):',
    ...chosen.map((exemplar, index) => `${index + 1}) ${renderExemplar(exemplar)}`),
  ].join('\n\n');
}
