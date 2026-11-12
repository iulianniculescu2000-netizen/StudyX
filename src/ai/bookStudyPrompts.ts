/**
 * bookStudyPrompts.ts
 *
 * Scripturile pentru „Schemă și carduri din carte”: cardurile și schema pornesc din paginile alese, iar fiecare
 * propunere poartă pagina și un citat scurt din ea. Pur (fără rețea, fără store). Cardurile reutilizează autorul de
 * flashcarduri (`flashcardPrompts`), schema reutilizează regulile de scheme (`diagramRules`, `diagramPlanning`).
 */
import { DIAGRAM_RULES_COMPACT } from './diagramRules';
import { diagramLayoutHint } from './diagramPlanning';
import { LANGUAGE_RULE, MEDICAL_SAFETY_RULES, PERSONA_CORE, TERMINOLOGY_RULE, CONTEXT_IS_MATERIAL_RULE } from './promptKit';

/** Lungimea maximă a citatului păstrat (un citat, nu pagina): garda de drepturi de autor din `bookProtection`. */
export const QUOTE_MAX_CHARS = 200;

/** Marcajul paginii în fragmentul trimis modelului; modelul îl întoarce în câmpul „page”. */
export const pageHeader = (page: number): string => `[p. ${page}]`;

export const CITED_CARDS_OUTPUT_SPEC =
  'Fiecare card are OBLIGATORIU „page” (numărul din marcajul [p. N] sub care apare faptul) și „quote” (o bucată de cel mult ' +
  `${QUOTE_MAX_CHARS} de caractere, copiată cuvânt cu cuvânt din acea pagină, care susține răspunsul). Un card fără pagină și citat se aruncă. ` +
  'Răspunde DOAR cu JSON valid, fără text în plus și fără markdown: ' +
  '{"cards":[{"front":"…","back":"…","difficulty":"easy|medium|hard","page":0,"quote":"…"}]}';

export function buildSchemaSystem(): string {
  return [
    PERSONA_CORE,
    'Acum construiești o schemă de studiu dintr-un capitol de carte.',
    LANGUAGE_RULE,
    TERMINOLOGY_RULE,
    MEDICAL_SAFETY_RULES,
    CONTEXT_IS_MATERIAL_RULE,
    DIAGRAM_RULES_COMPACT,
  ].join('\n\n');
}

export interface SchemaPromptInput {
  topic: string;
  bookLine?: string;
  /** Pagini cu marcaje [p. N], deja alese și tăiate la buget. */
  context: string;
}

export function buildSchemaUserPrompt(input: SchemaPromptInput): string {
  const subject = input.bookLine ? `„${input.topic}” (${input.bookLine})` : `„${input.topic}”`;
  return [
    `Fă o singură schemă a ideilor principale despre ${subject}, doar din paginile de mai jos. Nu adăuga nimic din afara lor.`,
    diagramLayoutHint(input.topic),
    'Schema are între 6 și 12 noduri. Dacă paginile nu ajung pentru o schemă utilă, întoarce „schema” gol.',
    `Cere-ți și dovezile: „quotes” are 1–3 citate, fiecare copiat cuvânt cu cuvânt din pagini (cel mult ${QUOTE_MAX_CHARS} de caractere) și însoțit de pagina lui.`,
    `PAGINI DIN CARTE:\n"""\n${input.context.trim()}\n"""`,
    'Răspunde DOAR cu JSON valid, fără text în plus: ' +
      '{"title":"…","schema":"conținutul blocului schema, fără ``` ","quotes":[{"page":0,"quote":"…"}]}',
  ].join('\n\n');
}
