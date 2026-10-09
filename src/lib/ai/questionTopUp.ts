/**
 * Completarea grilelor care lipsesc. Modelul întoarce uneori mai puține decât s-au cerut, iar filtrele (format, verificare
 * medicală, dubluri) mai scot câteva: „5 cerute, 2 primite”. Aici, după primul lot, cerem EXACT diferența (cu enunțurile
 * deja acceptate ca „nu repeta”), de cel mult `MAX_TOPUP_ROUNDS` ori. Se oprește la prima eroare (limită, rețea) sau când o
 * rundă nu aduce nimic nou, și întoarce ce are: niciodată nu aruncă din cauza completării. Pur: generarea e injectată.
 */
import type { Question } from '../../types';

/** Runde de completare după primul lot (fiecare = un apel mic, doar pentru ce lipsește). */
export const MAX_TOPUP_ROUNDS = 2;
/** Câte enunțuri deja acceptate se trimit ca „nu repeta” (plafon, ca promptul să rămână mic). */
const MAX_AVOID = 40;
const MAX_AVOID_CHARS = 140;

export interface TopUpBatch {
  questions: Question[];
  medicallyFlaggedCount?: number;
  malformedDroppedCount?: number;
  flaggedReasons?: string[];
}

export interface TopUpResult {
  questions: Question[];
  requested: number;
  /** Runde de completare efectiv făcute (0 = primul lot a ajuns). */
  rounds: number;
  /** Eliminate de verificarea medicală în toate loturile. */
  medicallyFlaggedCount: number;
  /** Lipsa neexplicată de verificarea medicală: modelul a dat mai puține sau au fost eliminate ca incomplete. */
  malformedDroppedCount: number;
  flaggedReasons: string[];
}

/** Cheia de comparație a unui enunț: fără diacritice, litere mici, fără punctuație. */
export function questionTextKey(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Enunțurile de evitat, scurtate, pentru promptul de completare. */
export function avoidList(questions: readonly Question[]): string[] {
  return questions.slice(-MAX_AVOID).map((q) => q.text.replace(/\s+/g, ' ').trim().slice(0, MAX_AVOID_CHARS)).filter(Boolean);
}

export async function fillShortfall(opts: {
  target: number;
  first: TopUpBatch;
  generateMore: (need: number, avoidTexts: string[]) => Promise<TopUpBatch>;
  maxRounds?: number;
}): Promise<TopUpResult> {
  const { target } = opts;
  const maxRounds = opts.maxRounds ?? MAX_TOPUP_ROUNDS;
  const seen = new Set<string>();
  const questions: Question[] = [];
  const add = (batch: readonly Question[]): number => {
    let added = 0;
    for (const q of batch) {
      const key = questionTextKey(q.text);
      if (!key || seen.has(key) || questions.length >= target) continue;
      seen.add(key);
      questions.push(q);
      added += 1;
    }
    return added;
  };

  add(opts.first.questions);
  let flagged = opts.first.medicallyFlaggedCount ?? 0;
  const reasons = [...(opts.first.flaggedReasons ?? [])];
  let rounds = 0;

  while (questions.length < target && rounds < maxRounds) {
    rounds += 1;
    let batch: TopUpBatch;
    try {
      batch = await opts.generateMore(target - questions.length, avoidList(questions));
    } catch (error) {
      if (isAbortError(error)) throw error;
      break; // limită, rețea, răspuns nevalid: păstrăm ce avem, raportul spune cât a lipsit
    }
    flagged += batch.medicallyFlaggedCount ?? 0;
    reasons.push(...(batch.flaggedReasons ?? []));
    if (add(batch.questions) === 0) break;
  }

  return {
    questions,
    requested: target,
    rounds,
    medicallyFlaggedCount: flagged,
    malformedDroppedCount: Math.max(0, target - questions.length - flagged),
    flaggedReasons: reasons,
  };
}

/** Linia adăugată cererii de completare: ce să nu repete. Goală când nu e nimic de evitat. */
export function avoidInstruction(avoidTexts: readonly string[] | undefined): string {
  if (!avoidTexts || avoidTexts.length === 0) return '';
  return ` Nu repeta și nu reformula aceste enunțuri deja făcute: ${avoidTexts.map((t) => `„${t}”`).join('; ')}.`;
}

/**
 * Raportul cinstit când numărul primit e sub cel cerut („3 din 5”), cu motivele. Gol când s-a primit tot ce s-a cerut
 * și nimic n-a fost eliminat (dar o eliminare compensată prin completare se spune scurt).
 */
export function describeShortfall(label: string, r: {
  requested: number;
  received: number;
  rounds: number;
  medicallyFlaggedCount?: number;
  malformedDroppedCount?: number;
}): string[] {
  const lines: string[] = [];
  const flagged = r.medicallyFlaggedCount ?? 0;
  const malformed = r.malformedDroppedCount ?? 0;
  if (r.received < r.requested) {
    const why: string[] = [];
    if (flagged) why.push(`${flagged} eliminate de verificarea medicală (răspuns marcat greșit)`);
    if (malformed) why.push(`${malformed} nu au venit sau au fost generate incomplet`);
    lines.push(`„${label}": ai cerut ${r.requested}, am reușit ${r.received}${why.length ? ` — ${why.join('; ')}` : ''}${r.rounds ? `, după ${r.rounds} ${r.rounds === 1 ? 'rundă' : 'runde'} de completare` : ''}. Cere din nou ce lipsește.`);
  } else if (flagged && r.rounds > 0) {
    lines.push(`„${label}": ${flagged} grile au picat verificarea medicală; le-am înlocuit cu altele (${r.received} din ${r.requested}).`);
  }
  return lines;
}
