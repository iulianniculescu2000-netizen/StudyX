import { CHARS_PER_TOKEN } from '../lib/ai/tokenBudget';

/** Reuse the application's estimate; this is not a provider tokenizer. */
export function contextCharsForTokens(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return Math.floor(tokens * CHARS_PER_TOKEN);
}

/** Unknown/invalid budgets fail closed; Infinity remains a supported chunk limit. */
export function contextLimit(value: number): number {
  return value === Infinity ? Infinity : Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Only collapse ordinary spaces in single-line prose. Layout, Markdown, code,
 * math and nonstandard whitespace may carry meaning and are left untouched.
 * Outer trimming matches the builder's existing behavior.
 */
export function normalizeContextProse(text: string): string {
  const trimmed = text.trim();
  if (/[^\S ]/u.test(trimmed) || [...'`~|<>\\$*_#[]{}='].some(marker => trimmed.includes(marker))) return trimmed;
  return trimmed.replace(/ {2,}/g, ' ');
}

/** Exact text plus citation identity: never discard a merely similar fact. */
export function contextDuplicateKey(body: string, citation: readonly unknown[]): string {
  return JSON.stringify([citation, body]);
}
