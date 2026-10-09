/**
 * (f) selfCritique — a doua trecere ieftină (rută `light`), declanșată DOAR pentru răspunsurile
 * marcate de `answerChecklist` cu probleme care cer rescriere (sau doze fără sursă).
 *
 * Promptul de sistem are ~45 tokeni. Cererea trimite răspunsul o singură dată (nu și istoricul) și
 * cere ca ieșirea să fie fie `OK`, fie răspunsul corectat — deci costul tipic e ≈ 1× răspunsul.
 */
import type { AnswerCheckResult } from './answerChecklist';
import { estimateTextTokens, type HelperMessage } from './shared';

export const SELF_CRITIQUE_SYSTEM =
  'Corectează răspunsul medical: română cu ș/ț, fără fapte inventate, doze doar cu sursă sau „verifică în ghid”, citări doar din surse. Dacă e corect scrie doar OK; altfel răspunsul corectat.';

export interface SelfCritiqueGate {
  run: boolean;
  reason: 'issues' | 'dose' | 'clean' | 'too-long' | 'disabled';
}

export interface SelfCritiqueOptions {
  /** Răspunsurile mai lungi decât atât (tokeni estimați) nu merită a doua trecere. Implicit 900. */
  maxAnswerTokens?: number;
  enabled?: boolean;
}

/** Decide dacă merită a doua trecere. Nu rulează pe răspunsuri curate. */
export function shouldSelfCritique(
  answer: string,
  check: Pick<AnswerCheckResult, 'issues' | 'needsRegeneration'>,
  options: SelfCritiqueOptions = {},
): SelfCritiqueGate {
  if (options.enabled === false) return { run: false, reason: 'disabled' };
  if (estimateTextTokens(answer) > (options.maxAnswerTokens ?? 900)) return { run: false, reason: 'too-long' };
  if (check.needsRegeneration) return { run: true, reason: 'issues' };
  if (check.issues.some((i) => i.code === 'dose-unsourced')) return { run: true, reason: 'dose' };
  return { run: false, reason: 'clean' };
}

export function buildSelfCritiqueMessages(answer: string, hint = ''): HelperMessage[] {
  return [
    { role: 'system', content: SELF_CRITIQUE_SYSTEM },
    { role: 'user', content: hint ? `${hint}\n\n${answer}` : answer },
  ];
}

export type SelfCritiqueOutcome = { kind: 'keep' } | { kind: 'replace'; text: string };

/** Interpretează ieșirea: „OK” → păstrează; text valid și nu mult mai scurt → înlocuiește. */
export function parseSelfCritiqueReply(original: string, reply: string | null | undefined): SelfCritiqueOutcome {
  const text = (reply ?? '').trim();
  if (!text || /^ok[.!]?$/i.test(text)) return { kind: 'keep' };
  // O „corectură” mult mai scurtă înseamnă de obicei că modelul a rezumat: nu o folosim.
  if (text.length < original.trim().length * 0.5) return { kind: 'keep' };
  return { kind: 'replace', text };
}
