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
import { findFormIssues, wordCount } from './examForm';

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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  if (avg === 0) return 0;
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2))) / avg;
}

/**
 * Trăsături măsurate în cuvinte pe cele 1200 de grile reale 2021–2025 (proiectul Grile rezidentiat); completează
 * metricile pe caractere de mai sus. Doar la rezidențiat. Valorile reale: enunț cu mediana de 8 cuvinte, dispersia lungimii
 * opțiunilor (CV) 0,34, cheia cu ~0,4 cuvinte mai lungă decât distractorii, 56% din grilele CM cu 3 corecte, zero trimiteri la sursă.
 */
export function residencyWordMetrics(questions: Question[]): ConformanceMetric[] {
  const stemMedian = median(questions.map((q) => wordCount(q.text)));

  const spreads = questions.map((q) => coefficientOfVariation(q.options.map((o) => wordCount(o.text))));
  const spread = mean(spreads);

  const keyGaps = questions.flatMap((q) => {
    const key = q.options.filter((o) => o.isCorrect).map((o) => wordCount(o.text));
    const wrong = q.options.filter((o) => !o.isCorrect).map((o) => wordCount(o.text));
    return key.length && wrong.length ? [mean(key) - mean(wrong)] : [];
  });
  const keyGap = mean(keyGaps);

  const errorShare = share(questions.map((q) => findFormIssues(q, 'residency').some((issue) => issue.severity === 'error')));

  const metrics: ConformanceMetric[] = [
    {
      id: 'stemWords',
      label: 'Mediana enunțului (cuvinte)',
      value: stemMedian,
      target: '5–12 cuvinte',
      ok: stemMedian >= 5 && stemMedian <= 12,
      hint: 'Enunțul real are mediana de 8 cuvinte; enunțurile foarte scurte sau foarte lungi trădează o grilă generată.',
    },
    {
      id: 'optionSpread',
      label: 'Dispersia lungimii variantelor',
      value: spread,
      target: '≥ 0,20',
      ok: spread >= 0.2,
      hint: 'La examen o grilă are variante de lungimi diferite (una scurtă, una lungă); cele de aceeași lungime se văd.',
    },
    {
      id: 'keyGap',
      label: 'Cheia față de distractori (cuvinte)',
      value: keyGap,
      target: '−0,5…+1,5',
      ok: keyGap >= -0.5 && keyGap <= 1.5,
      hint: 'Cheia e în medie cu ~0,4 cuvinte mai lungă decât distractorii; o diferență mare o dă de gol.',
    },
    {
      id: 'formErrors',
      label: 'Grile cu semne sigure de „generat”',
      value: errorShare,
      target: '≤ 5%',
      ok: errorShare <= 0.05,
      hint: 'Trimiteri la carte („conform cursului”) sau variante-paragraf: la examenul real nu apar.',
    },
  ];

  const multiple = questions.filter((q) => q.options.filter((o) => o.isCorrect).length > 1);
  if (multiple.length >= 5) {
    const threeShare = share(multiple.map((q) => q.options.filter((o) => o.isCorrect).length === 3));
    metrics.push({
      id: 'cmMix',
      label: 'Complement multiplu cu 3 corecte',
      value: threeShare,
      target: '≤ 75%',
      ok: threeShare <= 0.75,
      hint: 'La examen sunt 25% cu 2 corecte, 56% cu 3 și 19% cu 4; un lot aproape numai cu 3 corecte nu seamănă.',
    });
  }
  return metrics;
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

  if (style === 'residency' && questions.length > 0) metrics.push(...residencyWordMetrics(questions));

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
      : metric.id === 'stemWords' ? `${metric.value} cuv.`
        : metric.id === 'optionSpread' ? metric.value.toFixed(2)
          : metric.id === 'keyGap' ? `${metric.value >= 0 ? '+' : ''}${metric.value.toFixed(1)}`
            : `${Math.round(metric.value * 100)}%`;
    lines.push(`${metric.ok ? '✓' : '✗'} ${metric.label}: ${value}  (țintă ${metric.target})`);
    if (!metric.ok && metric.hint) lines.push(`    → ${metric.hint}`);
  }
  return lines.join('\n');
}
