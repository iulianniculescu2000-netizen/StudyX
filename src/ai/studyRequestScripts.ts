/**
 * studyRequestScripts.ts
 *
 * Ce spune asistentul când i se cere să facă flashcarduri sau grile: cum întreabă, cum confirmă, cum anunță o problemă.
 * Scurt, cald și concret, ca un coleg care știe ce are de făcut. Pur (fără rețea sau store); variațiile se aleg după subiect,
 * deci aceeași cerere primește același răspuns, iar cereri diferite nu sună identic.
 */
import type { FlashcardDifficulty } from './flashcardPrompts';
import { FLASHCARD_DIFFICULTY_LABEL } from './flashcardPrompts';

export type StudyKindLabel = 'flashcards' | 'quiz';

const NOUN: Record<StudyKindLabel, { one: string; many: string; short: string }> = {
  flashcards: { one: 'flashcard', many: 'flashcarduri', short: 'carduri' },
  quiz: { one: 'grilă', many: 'grile', short: 'grile' },
};

/** „1 grilă”, „3 grile”, „20 de grile”: acordul numeralului în română. */
export function countLabel(kind: StudyKindLabel, n: number): string {
  const noun = NOUN[kind];
  if (n === 1) return `1 ${noun.one}`;
  const rest = n % 100;
  return `${n}${rest === 0 || rest >= 20 ? ' de' : ''} ${noun.many}`;
}

function pick<T>(options: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return options[hash % options.length];
}

export interface IntroInput {
  kind: StudyKindLabel;
  topic: string;
  count: number | null;
  difficulty: FlashcardDifficulty | null;
  folderName: string | null;
}

/** Recapitulează în clar ce a spus deja utilizatorul, ca să nu fie întrebat a doua oară. */
function understood(input: IntroInput): string | null {
  const parts: string[] = [];
  if (input.count !== null) parts.push(countLabel(input.kind, input.count));
  if (input.difficulty !== null) parts.push(`nivel ${FLASHCARD_DIFFICULTY_LABEL[input.difficulty].toLowerCase()}`);
  if (input.folderName) parts.push(`în folderul „${input.folderName}”`);
  return parts.length > 0 ? `Am reținut: ${parts.join(', ')}.` : null;
}

/** Mesajul care însoțește cartea de opțiuni. */
export function optionCardIntro(input: IntroInput): string {
  const noun = NOUN[input.kind].many;
  const seed = `${input.kind}:${input.topic}`;
  const opener = input.topic
    ? pick([
        `Sigur, fac ${noun} despre „${input.topic}”.`,
        `Bine, ${noun} despre „${input.topic}”.`,
        `Perfect, pregătesc ${noun} despre „${input.topic}”.`,
      ], seed)
    : pick([`Sigur, fac ${noun}.`, `Cu plăcere, pregătesc ${noun}.`], seed);
  const ask = input.topic
    ? pick(['Alege mai jos cum le vrei și le generez.', 'Spune-mi cum le vrei și mă apuc.', 'Alege nivelul, numărul și folderul, iar restul e treaba mea.'], `${seed}:ask`)
    : pick(['Scrie subiectul și alege cum le vrei.', 'Spune-mi despre ce să fie și alege restul mai jos.'], `${seed}:ask`);
  return [opener, understood(input), ask].filter(Boolean).join(' ');
}

export interface DoneInput {
  kind: StudyKindLabel;
  topic: string;
  produced: number;
  requested: number;
  destination: string;
  /** Fals când cardurile nu au pornit din text de carte. */
  grounded?: boolean;
}

export function optionCardDone(input: DoneInput): string {
  const base = `Gata: ${countLabel(input.kind, input.produced)} despre „${input.topic}”, în ${input.destination}.`;
  const parts = [base];
  if (input.produced < input.requested) {
    parts.push(`Mi-ai cerut ${input.requested}, dar restul ar fi fost repetări sau nu erau susținute de text.`);
  }
  if (input.grounded === false) {
    parts.push('N-am găsit text în cărți pentru subiectul ăsta, așa că vin din cunoștințe medicale generale: merită verificate.');
  }
  parts.push(input.kind === 'flashcards'
    ? pick(['Le poți repeta acum.', 'Începe când ești gata.'], `${input.topic}:done`)
    : pick(['Le poți rezolva acum.', 'Sunt gata de rezolvat.'], `${input.topic}:done`));
  return parts.join(' ');
}

export function optionCardFailed(reason: string): string {
  const clean = reason.trim().replace(/\.+$/, '');
  return `Nu a ieșit${clean ? `: ${clean}` : ''}. Poți încerca din nou cu același card, sau schimbă subiectul.`;
}

export const OPTION_CARD_CANCELLED = 'Am lăsat-o baltă. Spune-mi când vrei să reluăm.';
