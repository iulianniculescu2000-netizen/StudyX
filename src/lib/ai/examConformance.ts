/**
 * Scores a set of questions against the shape of the real exam.
 *
 * "The AI got smarter" is an opinion until something measures it. These targets
 * are the numbers actually observed in the corpus — the official rezidențiat
 * papers (2021–2024) and two Romanian question banks, ~2000 parsed items — so a
 * generated set can be compared against the exam instead of against taste.
 *
 * The score is deliberately about FORM, not medical correctness: form is what
 * can be checked offline, for free, on every generated set. Correctness needs a
 * second model pass and is a separate concern.
 */
import type { Question } from '../../types';
import { EXAM_STYLE_META, type ExamStyle } from './examStyle';

export interface ConformanceTarget {
  /** Share of items with the expected option count (0-1). */
  optionCount: number;
  /** Share of stems ending in a colon. */
  colonStems: [number, number];
  /** Mean stem length in characters. */
  stemLength: [number, number];
  /** Mean option length in characters. */
  optionLength: [number, number];
  /** Share of negative stems ("NU", "cu excepția", "incorectă"). */
  negativeStems: [number, number];
  /** Share of clinical vignettes. */
  vignettes: [number, number];
}

/** Measured on the corpus; ranges are min/max across the sources analysed. */
export const CONFORMANCE_TARGETS: Record<ExamStyle, ConformanceTarget> = {
  residency: {
    optionCount: 0.97,
    colonStems: [0.6, 0.95],
    stemLength: [55, 115],
    optionLength: [20, 90],
    negativeStems: [0.05, 0.35],
    vignettes: [0, 0.15],
  },
  simple: {
    optionCount: 0.95,
    colonStems: [0.3, 0.95],
    stemLength: [30, 120],
    optionLength: [10, 90],
    negativeStems: [0, 0.35],
    vignettes: [0, 0.25],
  },
};

const NEGATIVE_RE = /\bNU\b|cu excep[țt]|incorect[ăa]|fals[ăa]?\b|EXCEPT/;
const VIGNETTE_RE = /pacient|b[ăa]rbat de|femeie de|se prezint[ăa]|ani,\s|de \d{1,2} ani/i;

export interface ConformanceMetric {
  id: string;
  label: string;
  value: number;
  target: string;
  ok: boolean;
  hint?: string;
}

export interface ConformanceReport {
  style: ExamStyle;
  questions: number;
  score: number;
  metrics: ConformanceMetric[];
}

function share(values: boolean[]): number {
  if (values.length === 0) return 0;
  return values.filter(Boolean).length / values.length;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function inRange(value: number, [min, max]: [number, number]) {
  return value >= min && value <= max;
}

/**
 * Compares a batch against the corpus. Returns per-metric results plus a 0-100
 * score, so a change to the prompt can be judged by a number that moves.
 */
export function scoreExamConformance(questions: Question[], style: ExamStyle): ConformanceReport {
  const expectedOptions = EXAM_STYLE_META[style].optionCount;
  const targets = CONFORMANCE_TARGETS[style];
  const stems = questions.map((question) => question.text.trim());

  const optionCountShare = share(questions.map((question) => {
    const correct = question.options.filter((option) => option.isCorrect).length;
    // Complement multiplu is five options in both tracks.
    const expected = correct > 1 ? 5 : expectedOptions;
    return question.options.length === expected;
  }));
  const colonShare = share(stems.map((stem) => /[:：]$/.test(stem)));
  const stemMean = mean(stems.map((stem) => stem.length));
  const optionMean = mean(questions.flatMap((question) => question.options.map((option) => option.text.trim().length)));
  const negativeShare = share(stems.map((stem) => NEGATIVE_RE.test(stem)));
  const vignetteShare = share(stems.map((stem) => VIGNETTE_RE.test(stem)));

  const metrics: ConformanceMetric[] = [
    {
      id: 'optionCount',
      label: `Număr de variante (${expectedOptions} pentru ${EXAM_STYLE_META[style].short.toLowerCase()})`,
      value: optionCountShare,
      target: `≥ ${Math.round(targets.optionCount * 100)}%`,
      ok: optionCountShare >= targets.optionCount,
      hint: 'Grilele cu alt număr de variante nu seamănă cu examenul și derutează la învățare.',
    },
    {
      id: 'colonStems',
      label: 'Enunțuri completabile (terminate cu „:")',
      value: colonShare,
      target: `${Math.round(targets.colonStems[0] * 100)}–${Math.round(targets.colonStems[1] * 100)}%`,
      ok: inRange(colonShare, targets.colonStems),
      hint: 'La examen enunțul e o frază scurtă completată de variante, nu o întrebare completă.',
    },
    {
      id: 'stemLength',
      label: 'Lungime medie enunț',
      value: stemMean,
      target: `${targets.stemLength[0]}–${targets.stemLength[1]} caractere`,
      ok: inRange(stemMean, targets.stemLength),
      hint: 'Enunțurile lungi sunt semn de vinietă clinică inutilă.',
    },
    {
      id: 'optionLength',
      label: 'Lungime medie variantă',
      value: optionMean,
      target: `${targets.optionLength[0]}–${targets.optionLength[1]} caractere`,
      ok: inRange(optionMean, targets.optionLength),
      hint: 'Variantele lungi trădează propoziții copiate din curs.',
    },
    {
      id: 'negativeStems',
      label: 'Enunțuri negative',
      value: negativeShare,
      target: `${Math.round(targets.negativeStems[0] * 100)}–${Math.round(targets.negativeStems[1] * 100)}%`,
      ok: inRange(negativeShare, targets.negativeStems),
      hint: 'Examenul are constant întrebări de tip „o singură afirmație este incorectă".',
    },
    {
      id: 'vignettes',
      label: 'Cazuri clinice',
      value: vignetteShare,
      target: `≤ ${Math.round(targets.vignettes[1] * 100)}%`,
      ok: inRange(vignetteShare, targets.vignettes),
      hint: 'La examenul real vinietele sunt rare; prea multe înseamnă alt tip de antrenament.',
    },
  ];

  const score = questions.length === 0
    ? 0
    : Math.round((metrics.filter((metric) => metric.ok).length / metrics.length) * 100);

  return { style, questions: questions.length, score, metrics };
}

/** Human-readable report, used by the eval script and available for the UI. */
export function formatConformanceReport(report: ConformanceReport): string {
  const lines = [
    `Conformitate cu examenul: ${report.score}/100  (${report.questions} grile · ${EXAM_STYLE_META[report.style].label})`,
    '',
  ];
  for (const metric of report.metrics) {
    const value = metric.id.endsWith('Length')
      ? `${Math.round(metric.value)} car.`
      : `${Math.round(metric.value * 100)}%`;
    lines.push(`${metric.ok ? '✓' : '✗'} ${metric.label}: ${value}  (țintă ${metric.target})`);
    if (!metric.ok && metric.hint) lines.push(`    → ${metric.hint}`);
  }
  return lines.join('\n');
}
