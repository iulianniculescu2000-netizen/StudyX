/**
 * Two question tracks, because students need both.
 *
 * `residency` is the format of the national exam, measured on the official
 * papers (2021–2024) and two Romanian question banks: five options A–E, short
 * colon-terminated stems, single-category distractors. `simple` is the ordinary
 * university-subject quiz: four options A–D, plain phrasing, no exam
 * conventions.
 *
 * The distinction is not cosmetic — a student practising for rezidențiat on
 * four-option questions trains the wrong reflex, and a student revising an
 * ordinary subject does not need "conform clasificării KDIGO".
 */
export type ExamStyle = 'residency' | 'simple';

export const DEFAULT_EXAM_STYLE: ExamStyle = 'residency';

export const EXAM_STYLE_META: Record<ExamStyle, {
  label: string;
  short: string;
  description: string;
  optionCount: number;
  tag: string;
}> = {
  residency: {
    label: 'Grile de rezidențiat',
    short: 'Rezidențiat',
    description: '5 variante (A–E), în stilul subiectelor oficiale',
    optionCount: 5,
    tag: 'rezidentiat',
  },
  simple: {
    label: 'Grile simple',
    short: 'Simplu',
    description: '4 variante (A–D), pentru materiile din facultate',
    optionCount: 4,
    tag: 'grila-simpla',
  },
};

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Wording that asks for the plain university-subject format. */
const SIMPLE_HINTS = [
  /\bgril[ae]\s+simpl/,
  /\bsimpl[ae]\b(?!\s*(?:u|,)?\s*complement)/,
  /\bcomplement\s+simplu\s+cu\s+4\b/,
  /\b(?:pentru|la)\s+(?:materi[ae]|facultate|licen[țt]a|examenul de an|colocviu|seminar)/,
  /\b4\s*(?:variante|optiuni|raspunsuri)\b/,
  /\bstil\s+clasic\b/,
];

/** Wording that explicitly asks for the exam format. */
const RESIDENCY_HINTS = [
  /\brezidentiat\b/,
  /\brezi\b/,
  /\bexamen(?:ul)?\s+na[țt]ional\b/,
  /\bca\s+la\s+examen\b/,
  /\b5\s*(?:variante|optiuni|raspunsuri)\b/,
  /\ba\s*-\s*e\b/,
];

/**
 * Reads the requested track straight from the user's phrasing. Returns null when
 * nothing was asked for, so the caller can apply its own default instead of
 * having one silently forced here.
 */
export function detectExamStyle(text: string): ExamStyle | null {
  const value = normalize(text ?? '');
  if (!value) return null;

  const wantsResidency = RESIDENCY_HINTS.some((pattern) => pattern.test(value));
  const wantsSimple = SIMPLE_HINTS.some((pattern) => pattern.test(value));

  // "grile simple de rezidentiat" is contradictory; the explicit exam mention wins.
  if (wantsResidency) return 'residency';
  if (wantsSimple) return 'simple';
  return null;
}


/** Tags stamped on a generated set so the student can tell the tracks apart. */
/**
 * Tags for a generated set. The `rezidentiat` tag is deliberately NOT added here: the exam
 * *format* (five options) is independent of *where the set lives*, and the tag hides a set
 * from "Toate grilele". It is added only when a set is filed into the Rezidențiat tree
 * (see rezidentiatPlacement), so a five-option set made for an ordinary course stays visible.
 */
export function examStyleTags(style: ExamStyle): string[] {
  return style === 'simple' ? ['ai', EXAM_STYLE_META.simple.tag] : ['ai'];
}
