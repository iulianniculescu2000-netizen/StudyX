/**
 * flashcardPrompts.ts
 *
 * Scripturile agentului de flashcarduri: cum gândește un card bun, cum se schimbă el după nivel și cum arată
 * cererea. Pur (fără rețea, fără store), ca să poată fi testat și citit dintr-o privire. Partea stabilă (rolul și
 * regulile) merge prima în prompt, ca furnizorii cu cache de prefix s-o refolosească între cereri.
 */
import {
  LANGUAGE_RULE,
  MEDICAL_SAFETY_RULES,
  PERSONA_CORE,
  TERMINOLOGY_RULE,
} from './promptKit';

export type FlashcardLevel = 'easy' | 'medium' | 'hard';
export type FlashcardDifficulty = FlashcardLevel | 'auto';

export const FLASHCARD_DIFFICULTY_LABEL: Record<FlashcardDifficulty, string> = {
  auto: 'Mixt',
  easy: 'Ușor',
  medium: 'Mediu',
  hard: 'Dificil',
};

/** Ce înseamnă fiecare nivel pentru un card (nu pentru o grilă: aici contează cât de adânc e răspunsul cerut). */
const LEVEL_PROFILE: Record<FlashcardLevel, string> = {
  easy:
    'UȘOR — recunoaștere și bază: definiții, „ce este”, denumiri, clasificări simple, cauza principală. Un singur fapt pe card, ' +
    'răspuns de 3–12 cuvinte. Fără praguri, doze sau excepții.',
  medium:
    'MEDIU — înțelegere și aplicare: mecanisme, criterii de diagnostic, indicații și contraindicații, pașii unei conduite, ' +
    'comparația dintre două entități apropiate. Răspunsul leagă cauza de efect, în 1–2 propoziții.',
  hard:
    'DIFICIL — nivel de rezidențiat: diagnostic diferențial, capcane frecvente, valori, praguri și excepții, ierarhia conduitei, ' +
    'mici vignete clinice (1–2 propoziții, întrebarea la final). Răspunsul spune și „de ce”, iar unde se confundă des adaugă ' +
    'o frază care începe cu „Capcană:”.',
};

/** Doar ca formă. Nu se copiază conținutul lor în cardurile cerute. */
const LEVEL_EXAMPLE: Record<FlashcardLevel, string> = {
  easy: '{"front":"Ce este sepsisul?","back":"Disfuncție de organ care amenință viața, produsă de un răspuns dereglat al organismului la o infecție.","difficulty":"easy"}',
  medium: '{"front":"Care sunt criteriile qSOFA?","back":"Frecvență respiratorie ≥22/min, alterarea stării mentale, TAS ≤100 mmHg; două sau mai multe înseamnă risc crescut.","difficulty":"medium"}',
  hard: '{"front":"De ce un qSOFA sub 2 nu exclude sepsisul?","back":"Scorul are sensibilitate mică: pacientul poate avea disfuncție de organ fără să îndeplinească două criterii. Capcană: qSOFA este instrument de triaj rapid, nu scorul de severitate SOFA.","difficulty":"hard"}',
};

const LEVELS: readonly FlashcardLevel[] = ['easy', 'medium', 'hard'];

export function difficultyBlock(difficulty: FlashcardDifficulty): string {
  if (difficulty === 'auto') {
    return [
      'NIVEL: amestecat, de la simplu la greu, în aproximativ 30% ușor, 50% mediu și 20% dificil. Marchează fiecare card cu nivelul lui.',
      ...LEVELS.map((level) => `- ${LEVEL_PROFILE[level]}`),
      'Exemple de FORMĂ (nu le copia conținutul):',
      ...LEVELS.map((level) => LEVEL_EXAMPLE[level]),
    ].join('\n');
  }
  return [
    `NIVEL CERUT: ${LEVEL_PROFILE[difficulty]}`,
    'Toate cardurile rămân la acest nivel; nu le „ușura” și nu le „îngreuna” ca să iasă mai multe.',
    'Exemplu de FORMĂ (nu îi copia conținutul):',
    LEVEL_EXAMPLE[difficulty],
  ].join('\n');
}

/** Rolul și regulile unui card bun. Stabil: nu depinde de cerere. */
export function buildFlashcardAuthorSystem(): string {
  return [
    PERSONA_CORE,
    'Acum ești autor de flashcarduri pentru rezidențiat. Un card bun se repetă în zece secunde și fixează un singur lucru.',
    LANGUAGE_RULE,
    TERMINOLOGY_RULE,
    MEDICAL_SAFETY_RULES,
    [
      'UN CARD BUN:',
      '- o singură idee pe card; fața e o întrebare sau o cerință precisă, cu un singur răspuns corect',
      '- fața se înțelege singură, fără pachetul în jur: numește boala, sindromul sau situația („Un semn endoscopic precoce în boala Crohn?”, nu „Un semn precoce?”); fără etichete de tipul „[Cardiologie]” și fără sigle nedezvoltate',
      '- formele de examen funcționează cel mai bine: „cea mai frecventă cauză de…”, „tratamentul de elecție în…”, „singurul… care…”, „semnul patognomonic pentru…”, „valoarea-țintă a…”, „care NU este…”',
      '- spatele începe direct cu răspunsul, cu literă mare, în 1–3 rânduri scurte; fără introduceri',
      '- reformulează, nu copia fraze din text; fără „conform textului” și fără pagini sau numere de capitol',
      '- fără markdown, fără liste cu buline în card; separă ideile cu virgule sau punct și virgulă',
      '- cardurile din set nu se repetă și acoperă subiectul pe lățime, nu doar începutul lui',
      '- valorile numerice, dozele și pragurile doar dacă apar în context sau le știi sigur; altfel întreabă despre principiu',
    ].join('\n'),
  ].join('\n\n');
}

/** Aspecte care răspândesc cardurile atunci când nu avem text de carte și subiectul trebuie acoperit larg. */
export const COVERAGE_FACETS = [
  'definiție, epidemiologie și factori de risc',
  'etiologie și fiziopatologie',
  'tablou clinic și semne cheie',
  'diagnostic: criterii și investigații',
  'diagnostic diferențial și capcane',
  'tratament și conduită',
  'complicații, prognostic și monitorizare',
] as const;

const FRONT_PREVIEW = 80;
const AVOID_LIMIT = 40;

export interface FlashcardRequestPrompt {
  topic: string;
  /** Ex. „Kumar și Clark, Cap. 8”; apare doar când știm din ce carte vine subiectul. */
  bookLine?: string;
  difficulty: FlashcardDifficulty;
  count: number;
  /** Fragment din carte pe care cardurile trebuie să-l respecte. Gol = subiect liber. */
  context?: string;
  /** Aspectul pe care să-l acopere mai ales acest lot (la subiecte fără text). */
  facet?: string;
  avoidFronts?: readonly string[];
}

export const FLASHCARD_OUTPUT_SPEC =
  'Răspunde DOAR cu JSON valid, fără text în plus și fără markdown: {"cards":[{"front":"…","back":"…","difficulty":"easy|medium|hard"}]}';

export function buildFlashcardUserPrompt(input: FlashcardRequestPrompt): string {
  const lines: string[] = [];
  const subject = input.bookLine ? `„${input.topic}” (${input.bookLine})` : `„${input.topic}”`;
  lines.push(`Fă-mi exact ${input.count} ${input.count === 1 ? 'flashcard' : 'flashcarduri'} despre ${subject}.`);
  lines.push(difficultyBlock(input.difficulty));

  if (input.context?.trim()) {
    lines.push(
      'Folosește DOAR informația din fragmentul de mai jos. Dacă nu ajunge pentru ' +
        `${input.count} carduri bune, returnează mai puține, nu inventa ca să completezi.`,
      `FRAGMENT DIN CARTE:\n"""\n${input.context.trim()}\n"""`,
    );
  } else {
    lines.push(
      'Nu ai text din carte pentru acest subiect: folosește cunoștințe medicale solide, la nivel de rezidențiat. ' +
        'Dacă nu ești sigur de o valoare exactă, întreabă despre principiu sau criteriu, nu despre cifră.',
    );
  }
  if (input.facet) lines.push(`Acoperă mai ales: ${input.facet}.`);

  const avoid = (input.avoidFronts ?? []).filter(Boolean).slice(0, AVOID_LIMIT);
  if (avoid.length > 0) {
    lines.push(`Nu repeta ce există deja:\n${avoid.map((front) => `- ${front.length > FRONT_PREVIEW ? `${front.slice(0, FRONT_PREVIEW)}…` : front}`).join('\n')}`);
  }
  lines.push(FLASHCARD_OUTPUT_SPEC);
  return lines.join('\n\n');
}
