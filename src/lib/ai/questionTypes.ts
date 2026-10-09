/**
 * Question-type router for AI generation.
 *
 * Medicine exams test the same fact in many shapes — a definition, a mechanism,
 * a differential, a clinical vignette. Generating only "what is X?" recall
 * questions leaves students unprepared. This module lets the caller request a
 * mix of question types and turns that request into prompt guidance plus an
 * even distribution across a batch.
 */

export type QuestionType =
  | 'definition' // Ce este X?
  | 'mechanism' // Prin ce mecanism produce X efectul Y?
  | 'diagnosis' // Ce diagnostic se potrivește cu tabloul clinic?
  | 'differential' // Ce diferențiază X de Y?
  | 'complication' // Care e complicația principală a X?
  | 'treatment' // Care e tratamentul de primă linie pentru X?
  | 'number_value' // Valori normale, doze, criterii numerice
  | 'clinical_case'; // Caz clinic scurt → întrebare

export const ALL_QUESTION_TYPES: QuestionType[] = [
  'definition',
  'mechanism',
  'diagnosis',
  'differential',
  'complication',
  'treatment',
  'number_value',
  'clinical_case',
];

/** Short Romanian labels for the UI checkboxes. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  definition: 'Definiții',
  mechanism: 'Mecanism',
  diagnosis: 'Diagnostic',
  differential: 'Diagnostic diferențial',
  complication: 'Complicații',
  treatment: 'Tratament',
  number_value: 'Valori / doze',
  clinical_case: 'Caz clinic',
};

/** Per-type prompt fragments that steer the model toward each shape. */
export const QUESTION_TYPE_PROMPTS: Record<QuestionType, string> = {
  definition:
    'DEFINIȚIE/CONCEPT: întreabă ce este o entitate, cum se clasifică sau cum se numește un concept (ex. "Ce este...?", "Cum se definește...?").',
  mechanism:
    'MECANISM FIZIOPATOLOGIC: întreabă prin ce mecanism se produce un fenomen sau efect (ex. "Prin ce mecanism...?", "Care este substratul fiziopatologic al...?").',
  diagnosis:
    'DIAGNOSTIC: prezintă un tablou clinic scurt și cere diagnosticul cel mai probabil (ex. "Ce diagnostic se potrivește cu...?").',
  differential:
    'DIAGNOSTIC DIFERENȚIAL: cere elementul care diferențiază două entități asemănătoare (ex. "Ce diferențiază X de Y?").',
  complication:
    'COMPLICAȚII: întreabă care este complicația principală/de temut a unei afecțiuni sau proceduri.',
  treatment:
    'TRATAMENT: întreabă conduita sau tratamentul de primă linie pentru o afecțiune (ex. "Care este tratamentul de primă linie pentru...?").',
  number_value:
    'VALORI/DOZE: întreabă valori normale, praguri diagnostice, doze sau criterii numerice. Nu inventa cifre — folosește doar valori stabile, larg acceptate.',
  clinical_case:
    'CAZ CLINIC: construiește o vignetă scurtă (pacient, simptome, semne-cheie) urmată de o întrebare cu raționament clinic.',
};

/**
 * Normalize a possibly-empty selection to a non-empty list (defaults to all).
 */
export function resolveQuestionTypes(types?: QuestionType[]): QuestionType[] {
  if (!types || types.length === 0) return [...ALL_QUESTION_TYPES];
  return types.filter((type) => ALL_QUESTION_TYPES.includes(type));
}

/**
 * Spread `count` questions as evenly as possible across the chosen types.
 * Returns an array of length `count` (e.g. [definition, mechanism, definition...]).
 */
export function distributeQuestionTypes(count: number, types?: QuestionType[]): QuestionType[] {
  const pool = resolveQuestionTypes(types);
  if (count <= 0 || pool.length === 0) return [];
  const out: QuestionType[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[i % pool.length]);
  }
  return out;
}

/** Count how many of each type a distribution contains (for previews). */
export function distributionCounts(count: number, types?: QuestionType[]): Array<{ type: QuestionType; count: number }> {
  const dist = distributeQuestionTypes(count, types);
  const tally = new Map<QuestionType, number>();
  for (const type of dist) tally.set(type, (tally.get(type) ?? 0) + 1);
  return [...tally.entries()].map(([type, n]) => ({ type, count: n }));
}

/** Human-readable distribution preview, e.g. "~3 definiții, ~2 cazuri clinice". */
export function previewDistribution(count: number, types?: QuestionType[]): string {
  return distributionCounts(count, types)
    .map(({ type, count: n }) => `~${n} ${QUESTION_TYPE_LABELS[type].toLowerCase()}`)
    .join(', ');
}

/**
 * Build the prompt instruction describing the requested mix and the target
 * count per type. Returns '' when all types are selected with no preference
 * worth constraining (still useful to nudge variety), otherwise a focused block.
 */
export function buildQuestionTypeInstruction(count: number, types?: QuestionType[]): string {
  const counts = distributionCounts(count, types);
  if (counts.length === 0) return '';
  const lines = counts.map(({ type, count: n }) => `- ${n}x ${QUESTION_TYPE_PROMPTS[type]}`);
  return [
    'VARIAZĂ TIPUL ÎNTREBĂRILOR conform distribuției următoare (aproximativ):',
    ...lines,
    'Adaugă pe fiecare obiect din JSON câmpul "type" cu una dintre valorile: ' +
      counts.map(({ type }) => `"${type}"`).join(', ') +
      '.',
  ].join('\n');
}
