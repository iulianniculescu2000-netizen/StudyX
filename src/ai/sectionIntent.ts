/**
 * Subsecțiunea pe care o cere întrebarea („tratamentul”, „cum se confirmă”, „cauzele”…) și subsecțiunile din care face parte un
 * fragment de carte. Kumar și Lawrence își împart capitolele în aceleași subsecțiuni (`## Tratament` de 87 de ori în Kumar,
 * `## Tablou clinic`, `## Investigații`, `## Etiologie`): la „tratamentul acalaziei” trebuie să vină fragmentul de sub
 * `## Tratament`, nu cel de diagnostic diferențial, chiar dacă acela numește boala de mai multe ori.
 */
import { normalizeSearchText } from './medicalSynonyms';

export type SectionIntent = 'treatment' | 'diagnosis' | 'clinical' | 'etiology' | 'complications';

const INTENTS: ReadonlyArray<{ intent: SectionIntent; query: RegExp; heading: RegExp }> = [
  { intent: 'treatment', query: /\b(tratam|trateaz|trata\b|terapi|terapeut|management|conduit|gestion)/, heading: /tratament|terapi|management|conduita/ },
  { intent: 'diagnosis', query: /\b(diagnostic(?!\w* diferential)|investiga|confirm|dozea|explorar)/, heading: /investigat|diagnostic(?! diferential)|evaluare/ },
  { intent: 'clinical', query: /\b(simptom|semne|semnele|tablou|manifest)/, heading: /tablou clinic|talou clinic|simptome|semne|examen fizic/ },
  { intent: 'etiology', query: /\b(cauz|etiolog|patogen|fiziopatolog|factori de risc)/, heading: /etiolog|patogen|fiziopatolog|cauze/ },
  { intent: 'complications', query: /\bcomplicat/, heading: /complicat/ },
];

/** Subsecțiunile cerute de întrebare (de obicei una, uneori niciuna). */
export function queryIntents(query: string): SectionIntent[] {
  const text = normalizeSearchText(query);
  return INTENTS.filter((entry) => entry.query.test(text)).map((entry) => entry.intent);
}

const HEADING_LINE = /^#{1,4}\s*(.{3,60})$/gm;

/** Subsecțiunile deschise de titlurile `## …` din text, în ordinea apariției (ultima e cea în care se termină textul). */
export function headingIntentsInOrder(text: string): SectionIntent[][] {
  const out: SectionIntent[][] = [];
  for (const match of text.matchAll(HEADING_LINE)) {
    const heading = normalizeSearchText(match[1]);
    out.push(INTENTS.filter((entry) => entry.heading.test(heading)).map((entry) => entry.intent));
  }
  return out;
}

/** Fragmentul anterior din aceeași sursă: id-urile sunt `<sursă>-chunk-<n>`. */
export function previousChunkId(id: string): string | null {
  const match = /^(.*-chunk-)(\d+)$/.exec(id);
  if (!match) return null;
  const n = Number(match[2]);
  return n > 0 ? `${match[1]}${n - 1}` : null;
}

/** Fragmentul următor din aceeași sursă. */
export function nextChunkId(id: string): string | null {
  const match = /^(.*-chunk-)(\d+)$/.exec(id);
  return match ? `${match[1]}${Number(match[2]) + 1}` : null;
}
