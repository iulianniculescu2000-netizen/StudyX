/**
 * (c) clarifyGate — decide determinist dacă mesajul e prea vag pentru un răspuns bun și, în acest caz,
 * întoarce O singură întrebare scurtă de clarificare (0 tokeni LLM) în loc de un răspuns slab.
 *
 * Conservator: se declanșează DOAR dacă mesajul nu are niciun cuvânt de conținut și nu există istoric,
 * document țintă sau atașament la care „asta” să se refere. Orice abreviere/termen medical → trece.
 */
import { contentWords, normalizeSearchText } from './shared';

export interface ClarifyContext {
  /** Există mesaje anterioare în conversație (deicticele se pot referi la ele). */
  hasHistory?: boolean;
  /** Utilizatorul a fixat un document/capitol țintă. */
  hasScopedSource?: boolean;
  /** Mesajul vine cu imagine/fișier atașat. */
  hasAttachment?: boolean;
}

export type ClarifyReason = 'ok' | 'social' | 'has-context' | 'vague' | 'empty';

export interface ClarifyDecision {
  clarify: boolean;
  reason: ClarifyReason;
  /** Întrebarea de clarificare (doar când `clarify`). */
  question?: string;
}

/** Verbe de comandă și deictice: nu poartă subiect. Fără diacritice. */
const COMMAND_AND_DEICTIC: ReadonlySet<string> = new Set([
  'explica', 'explica-mi', 'explicami', 'spune', 'spune-mi', 'zi', 'zi-mi', 'arata', 'arata-mi', 'fa', 'fa-mi', 'da-mi',
  'rezuma', 'rezuma-mi', 'ajuta', 'ajuta-ma', 'detaliaza', 'continua', 'repeta', 'traduce', 'simplifica',
  'grile', 'grila', 'flashcarduri', 'flashcard', 'rezumat', 'schema', 'intrebari', 'intrebare', 'ceva', 'asta', 'aceasta',
  'acesta', 'aia', 'aceea', 'astea', 'acestea', 'totul', 'tot', 'tema', 'subiectul', 'chestia', 'chestie', 'lucru', 'lucrul',
  'cumva', 'sa', 'bine', 'ok', 'inca', 'aici', 'acolo', 'deci', 'atunci', 'hai', 'incepem', 'vedem',
  'poti', 'putea', 'vrei', 'vreau', 'trebuie', 'stiu', 'inteleg', 'imi', 'nu-mi', 'putin', 'simplu', 'pe-scurt',
]);

const SOCIAL = /^(?:salut|bun[aă]|hei|hey|hello|mul[tț]umesc|mersi|merci|ok|bine|perfect|super|la revedere|pa)\b/i;

function questionFor(norm: string): string {
  if (/\b(grile|grila|intrebari)\b/.test(norm)) return 'Despre ce subiect sau capitol să fac grilele?';
  if (/\b(flashcard\w*|carduri)\b/.test(norm)) return 'Despre ce subiect sau capitol să fac flashcardurile?';
  if (/\b(rezuma\w*|rezumat|simplifica)\b/.test(norm)) return 'Ce text, capitol sau subiect vrei să rezum?';
  if (/\b(schema|diagrama)\b/.test(norm)) return 'Despre ce subiect să fac schema?';
  if (/\btraduce\b/.test(norm)) return 'Ce text vrei să traduc?';
  return 'La ce subiect te referi? Spune-mi termenul sau capitolul și continui imediat.';
}

export function shouldClarify(message: string, context: ClarifyContext = {}): ClarifyDecision {
  const text = (message ?? '').trim();
  if (!text) return { clarify: false, reason: 'empty' };
  if (SOCIAL.test(text) && text.split(/\s+/).length <= 4) return { clarify: false, reason: 'social' };
  if (context.hasHistory || context.hasScopedSource || context.hasAttachment) return { clarify: false, reason: 'has-context' };

  const norm = normalizeSearchText(text);
  const words = contentWords(text).filter((w) => !COMMAND_AND_DEICTIC.has(w));
  // Mesajele lungi nu sunt vagi, chiar dacă cuvintele par banale.
  if (words.length > 0 || text.length > 120) return { clarify: false, reason: 'ok' };
  return { clarify: true, reason: 'vague', question: questionFor(norm) };
}
