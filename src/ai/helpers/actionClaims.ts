/**
 * Chatul simplu nu are unelte: nu poate crea, salva, muta sau șterge nimic în aplicație (asta face agentul, care
 * rulează pe comenzi). Un model fără unelte poate totuși răspunde „Toate cele 5 grile au fost salvate în Cardiologie”
 * și studentul crede că e adevărat. Aici scoatem, fără LLM și fără tokeni, propozițiile care afirmă o acțiune
 * terminată asupra unor obiecte din aplicație și le înlocuim cu o notă onestă. Pur: fără stores, fără rețea.
 */
import { normalizeSearchText } from './shared';

/** Verbe la trecut care afirmă o acțiune terminată („am salvat”, „au fost create”, „s-au mutat”). */
const DONE_VERB = '(?:salvat|creat|mutat|adaugat|generat|sters|redenumit|pus|bagat|importat|indexat|reindexat|trimis|stocat)[aeiu]*';
const CLAIM_RES: RegExp[] = [
  new RegExp(`\\b(?:am|le am|l am|i am|ti am|ți am)\\s+${DONE_VERB}\\b`),
  new RegExp(`\\b(?:au fost|a fost|sunt acum|este acum|s au|s a)\\s+(?:\\w+\\s+){0,2}${DONE_VERB}\\b`),
  /\b(?:gata|facut|done)\b[^.!?\n]{0,30}\b(?:salvat|creat|mutat)/,
];

/** Obiecte din aplicație: fără ele, „au fost salvate vieți” sau „a fost creat un tabel” rămân neatinse. */
const APP_OBJECT_RE = /\b(?:grila|grile|grilele|set|seturi|setul|setului|folder|folderul|foldere|folderele|flashcard\w*|pachet\w*|deck\w*|intrebari\w*|biblioteca|carti\w*|carte|cartea|reindex\w*|capitol\w*)\b/;

export const ACTION_CLAIM_NOTE =
  'Notă: din chatul acesta nu pot crea, salva sau muta nimic în aplicație, deci nu am făcut asta. ' +
  'Dă o comandă clară (de ex. „Fă-mi 5 grile despre infarct în folderul Cardiologie”) și o execut ca agent, sau fă mutarea din lista de seturi.';

export interface ActionClaimResult {
  text: string;
  /** Câte propoziții cu afirmații false au fost scoase. */
  removed: number;
}

function sentenceClaimsAction(sentence: string): boolean {
  const norm = normalizeSearchText(sentence).replace(/-/g, ' ');
  return APP_OBJECT_RE.test(norm) && CLAIM_RES.some((re) => re.test(norm));
}

/**
 * Scoate propozițiile care afirmă o acțiune terminată în aplicație și adaugă o singură notă. `agentRan` = în tura asta a
 * rulat agentul (atunci afirmațiile vin din rezultate reale și nu se ating).
 */
export function neutralizeActionClaims(answer: string, opts: { agentRan?: boolean } = {}): ActionClaimResult {
  if (opts.agentRan || !answer.trim()) return { text: answer, removed: 0 };
  // Blocurile de cod și diagramele nu conțin afirmații despre aplicație.
  const parts = answer.split(/(```[\s\S]*?```)/g);
  let removed = 0;
  const cleaned = parts.map((part) => {
    if (part.startsWith('```')) return part;
    return part
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((sentence) => {
        if (sentenceClaimsAction(sentence)) {
          removed += 1;
          return false;
        }
        return true;
      })
      .join(' ');
  });
  if (removed === 0) return { text: answer, removed: 0 };
  const body = cleaned.join('').replace(/[ \t]{2,}/g, ' ').trim();
  return { text: body ? `${body}\n\n${ACTION_CLAIM_NOTE}` : ACTION_CLAIM_NOTE, removed };
}
