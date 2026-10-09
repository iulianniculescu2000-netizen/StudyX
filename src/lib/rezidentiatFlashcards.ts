import type { Question } from '../types';

/**
 * Refreshes an already-loaded built-in flashcard deck from the bundled JSON.
 *
 * The shipped deck gets corrected between releases (cleaner wording, fixed
 * chapters, removed truncated cards). Study progress is keyed by question id, so
 * the refresh must never make a card that has history disappear:
 *  - cards present in the bundled deck take its (corrected) content, in its order;
 *  - cards that were dropped from the bundle stay — at the end — when the student
 *    has answered them, and go away only when they have no history at all.
 */
export function mergeBuiltInDeck(
  existing: Question[],
  bundled: Question[],
  hasHistory: (questionId: string) => boolean,
): Question[] {
  const bundledIds = new Set(bundled.map((question) => question.id));
  const retained = existing.filter((question) => !bundledIds.has(question.id) && hasHistory(question.id));
  return [...bundled, ...retained];
}
