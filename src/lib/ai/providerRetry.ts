/**
 * Pure helpers for provider retry / fallback decisions, kept free of stores and fetch so they are unit-testable.
 */

export type RetryProviderId = 'groq' | 'google' | 'mistral' | 'local';

/** Statuses that say "the provider is busy or down right now" — worth a short retry, then the next provider. */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

/** Same decision from an error message ("HTTP 503", "Service unavailable", "overloaded", network resets). */
export function isTransientErrorMessage(message: string): boolean {
  return /\b(?:408|425|429|5\d\d)\b|service unavailable|overloaded|bad gateway|gateway time-?out|temporarily|high traffic|timed? ?out|nu a răspuns|failed to fetch|networkerror|load failed|ECONNRESET|ETIMEDOUT/i.test(message);
}

/** Backoff before retry number `attempt` (0-based): Retry-After wins when present, capped so Stop stays responsive. */
export function transientRetryDelayMs(attempt: number, retryAfterHeader: string | null, jitter = 0, capMs = 6000): number {
  const seconds = retryAfterHeader ? Number(retryAfterHeader) : 0;
  const headerMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  return Math.min(Math.max(headerMs, 800 * 2 ** attempt), capMs) + jitter;
}

/** How many tries one provider gets: fail fast when another provider is waiting, ride it out when it is the last one. */
export function attemptsForProvider(hasFallback: boolean): number {
  return hasFallback ? 2 : 3;
}

/** Next provider (in `order`, wrapping) other than `current` that has a non-empty key, or null. */
export function nextConfiguredProvider<P extends string>(
  current: P,
  keys: Partial<Record<P, string>>,
  order: readonly P[] = ['groq', 'google', 'mistral'] as unknown as readonly P[],
): P | null {
  const start = order.indexOf(current);
  for (let i = 1; i <= order.length; i++) {
    const candidate = order[(start + i + order.length) % order.length];
    // `local` is a safety net at the end of the chain, never a manual switch target.
    if (candidate !== current && (candidate as string) !== 'local' && (keys[candidate] ?? '').trim()) return candidate;
  }
  return null;
}

/** "comutarea la alt AI", "treci pe alt model", "schimbă providerul" — a command for the app, not a medical question. */
export function isSwitchProviderRequest(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[?!.]+$/g, '')
    .trim();
  if (!t || t.length > 80) return false;
  return /\b(comut\w*|schimb\w*|trec\w*|treci|foloseste|incearca|mergi)\b.{0,30}\b(alt|alta|altul|alt\s+(?:ai|model|provider|furnizor)|furnizor\w*|provider\w*)\b/.test(t)
    || /^(?:comutarea|schimbarea|trecerea)\s+(?:la|pe)\s+alt\b/.test(t);
}

/**
 * Conversation sent to the model: error bubbles are not answers, and a question whose answer failed is
 * dropped too (it is being asked again), so a retry does not repeat itself or feed errors back as context.
 */
export function historyWithoutFailedTurns<T extends { role: string; isError?: boolean }>(messages: T[]): T[] {
  return messages.filter((m, i) => !m.isError && !(m.role === 'user' && messages[i + 1]?.isError));
}
