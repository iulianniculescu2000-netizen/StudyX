/**
 * Ajutătorii cu cost 0 pentru chat (fără AI local): rescrierea interogării pentru regăsire,
 * poarta de clarificare și neutralizarea afirmațiilor inventate („am salvat/am creat"). Fără JSX.
 */
import { resolveHelperFlags } from '../../ai/helpers/helperSettings';
import { rewriteQuery } from '../../ai/helpers/queryRewrite';
import { shouldClarify } from '../../ai/helpers/clarifyGate';
import { neutralizeActionClaims } from '../../ai/helpers/actionClaims';

export function currentHelperFlags() {
  // Fără AI local: queryRewrite/answerChecklist sunt legate de local (oprite), clarifyGate rămâne implicit pornit.
  return resolveHelperFlags(false);
}

/** Interogarea pentru regăsire: rescrisă fără LLM când flagul e activ, altfel neschimbată. */
export function queryForRetrieval(text: string): string {
  try {
    if (!currentHelperFlags().queryRewrite) return text;
    const rewritten = rewriteQuery(text).searchText.trim();
    return rewritten || text;
  } catch {
    return text;
  }
}

/** Întrebarea de clarificare (răspuns direct, 0 tokeni) sau null. */
export function clarificationFor(text: string, ctx: { hasHistory: boolean; hasScopedSource: boolean }): string | null {
  try {
    if (!currentHelperFlags().clarifyGate) return null;
    const gate = shouldClarify(text, ctx);
    return gate.clarify && gate.question ? gate.question : null;
  } catch {
    return null;
  }
}

/**
 * După streaming: reparații gratuite. Chatul simplu nu are unelte, deci o afirmație
 * „am salvat / au fost create" e inventată — se neutralizează mereu (0 tokeni, fără flag).
 */
export async function checkAndComplete(args: { answer: string }): Promise<string> {
  if (!args.answer.trim()) return args.answer;
  return neutralizeActionClaims(args.answer).text;
}
