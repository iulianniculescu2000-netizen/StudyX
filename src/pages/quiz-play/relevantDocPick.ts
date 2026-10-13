import type { RetrievedChunk } from '../../ai/types';
import { formatRelevantDoc } from './relevantDocFormatting';

/** Sub atâtea caractere de text corp (fără titluri), un fragment nu are ce să-i arate studentului. */
export const MIN_BODY_CHARS = 160;
/** Termeni distinctivi ai ÎNTREBĂRII comuni cu fragmentul. */
export const MIN_SHARED_TERMS = 2;
/** Termeni ai RĂSPUNSULUI CORECT (sau ai explicației) comuni cu fragmentul: fără ei, fragmentul vorbește despre același subiect, nu susține grila. */
export const MIN_ANSWER_TERMS = 1;
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

const countShared = (wanted: ReadonlySet<string>, have: ReadonlySet<string>) => {
  let shared = 0;
  for (const word of wanted) if (have.has(word)) shared += 1;
  return shared;
};

/**
 * Din rezultatele căutării alege primul fragment care chiar ajută: scor sigur, text corp consistent, cel puțin două cuvinte-cheie
 * comune cu întrebarea ȘI cel puțin unul comun cu răspunsul corect sau explicația (altfel fragmentul doar vorbește despre același
 * subiect: la „anemie feriprivă, Hb 7,5, intervenția corectă?” aducea lista de alarmă pentru endoscopie, fără nimic despre tratament).
 * Un fragment-titlu sau o potrivire doar semantică nu se mai oferă ca „document relevant”.
 */
export function pickRelevantDoc(questionText: string, hits: readonly RetrievedChunk[], answerText = ''): RetrievedChunk | null {
  const wanted = terms(questionText);
  const answerOnly = new Set([...terms(answerText)].filter((word) => !wanted.has(word)));
  for (const hit of hits) {
    if (!hit.source || hit.score < MIN_SCORE) continue;
    if (bodyLength(hit.text) < MIN_BODY_CHARS) continue;
    const have = terms(hit.text);
    if (countShared(wanted, have) < MIN_SHARED_TERMS) continue;
    if (answerOnly.size > 0 && countShared(answerOnly, have) < MIN_ANSWER_TERMS) continue;
    return hit;
  }
  return null;
}
