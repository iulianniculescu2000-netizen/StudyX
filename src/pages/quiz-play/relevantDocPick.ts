import type { RetrievedChunk } from '../../ai/types';
import { formatRelevantDoc } from './relevantDocFormatting';

/** Sub atâtea caractere de text corp (fără titluri), un fragment nu are ce să-i arate studentului. */
export const MIN_BODY_CHARS = 160;
/** Termeni distinctivi (cel puțin 5 litere, comparați pe rădăcină) comuni între întrebare și fragment. */
export const MIN_SHARED_TERMS = 2;
const MIN_SCORE = 0.35;

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Rădăcini de 6 litere: româna flexionează („artritei” / „artrita”), deci cuvintele întregi s-ar rata între ele. */
const terms = (text: string) => new Set(fold(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 5).map((word) => word.slice(0, 6)));

/** Lungimea textului corp: titlurile (ex. „SPONDILITĂ ANCHILOZANTĂ / SA”) nu contează, deși se potrivesc perfect pe cuvinte. */
export function bodyLength(text: string): number {
  return formatRelevantDoc(text).reduce((sum, block) => {
    if (block.kind === 'heading') return sum;
    return sum + (block.kind === 'list' ? block.items.join(' ').length : block.text.length);
  }, 0);
}

/**
 * Din rezultatele căutării alege primul fragment care chiar ajută: scor sigur, text corp consistent și cel puțin
 * două cuvinte-cheie comune cu întrebarea. Un fragment-titlu sau o potrivire doar semantică nu se mai oferă ca „document relevant”.
 */
export function pickRelevantDoc(questionText: string, hits: readonly RetrievedChunk[]): RetrievedChunk | null {
  const wanted = terms(questionText);
  for (const hit of hits) {
    if (!hit.source || hit.score < MIN_SCORE) continue;
    if (bodyLength(hit.text) < MIN_BODY_CHARS) continue;
    const have = terms(hit.text);
    let shared = 0;
    for (const word of wanted) if (have.has(word)) shared += 1;
    if (shared >= MIN_SHARED_TERMS) return hit;
  }
  return null;
}
