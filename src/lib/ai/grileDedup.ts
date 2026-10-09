/**
 * Deduplicate extracted questions across many source files.
 *
 * The same grilă appears in file after file, often reworded slightly or with the
 * options in a different order. We collapse those to one entry, keeping the copy
 * with the most trustworthy answer, and flag cases where two copies disagree on
 * the correct answer (so the review screen can surface them).
 */
import type { ParsedQuestion } from './grileParser';
import { normalizeText } from './grileParser';

const SOURCE_RANK: Record<ParsedQuestion['answerSource'], number> = {
  explicit: 3,
  format: 2,
  ai: 1,
  none: 0,
};

/** Order-independent signature: normalized stem + sorted normalized options. */
function signature(q: ParsedQuestion): string {
  const stem = normalizeText(q.text);
  const opts = q.options
    .map((o) => normalizeText(o.text))
    .filter(Boolean)
    .sort()
    .join('|');
  return `${stem}||${opts}`;
}

function correctSet(q: ParsedQuestion): Set<string> {
  return new Set(q.options.filter((o) => o.isCorrect).map((o) => normalizeText(o.text)));
}

function sameAnswer(a: ParsedQuestion, b: ParsedQuestion): boolean {
  const sa = correctSet(a);
  const sb = correctSet(b);
  if (sa.size !== sb.size || sa.size === 0) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

/** Which of two duplicates to keep: better answer source, then higher confidence. */
function pickBetter(a: ParsedQuestion, b: ParsedQuestion): ParsedQuestion {
  const ra = SOURCE_RANK[a.answerSource];
  const rb = SOURCE_RANK[b.answerSource];
  if (ra !== rb) return ra > rb ? a : b;
  const ca = a.confidence === 'high' ? 2 : a.confidence === 'medium' ? 1 : 0;
  const cb = b.confidence === 'high' ? 2 : b.confidence === 'medium' ? 1 : 0;
  return ca >= cb ? a : b;
}

export interface DedupeResult {
  unique: ParsedQuestion[];
  duplicatesRemoved: number;
  conflicts: number; // duplicates whose answers disagreed
}

export function dedupeQuestions(questions: ParsedQuestion[]): DedupeResult {
  const map = new Map<string, ParsedQuestion>();
  let duplicatesRemoved = 0;
  let conflicts = 0;

  for (const q of questions) {
    const sig = signature(q);
    const existing = map.get(sig);
    if (!existing) {
      map.set(sig, q);
      continue;
    }
    duplicatesRemoved += 1;

    const bothAnswered = existing.answerSource !== 'none' && q.answerSource !== 'none';
    if (bothAnswered && !sameAnswer(existing, q)) {
      conflicts += 1;
      const winner = pickBetter(existing, q);
      // Copy rather than mutate: `q`/`existing` belong to the caller's array,
      // and assigning here made the warning appear on the original input too.
      map.set(sig, {
        ...winner,
        warnings: [...new Set([...winner.warnings, 'Surse diferite dau răspunsuri diferite — verifică.'])],
      });
    } else {
      map.set(sig, pickBetter(existing, q));
    }
  }

  return { unique: [...map.values()], duplicatesRemoved, conflicts };
}
