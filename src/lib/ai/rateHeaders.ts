/**
 * What a provider says about its rate-limit window in the response headers
 * (Groq sends `x-ratelimit-*`; others may send some or none, and a browser only
 * exposes headers the server lists in Access-Control-Expose-Headers). Everything
 * here is optional — the usage meter works from local counts when it is absent.
 */
export interface RateWindow {
  limitTokens?: number;
  remainingTokens?: number;
  /** Seconds until the token window resets, as reported at `at`. */
  resetTokensIn?: number;
  limitRequests?: number;
  remainingRequests?: number;
  resetRequestsIn?: number;
  /** When these numbers were read (ms since epoch). */
  at: number;
}

/** "2m59.56s", "7.66s", "1h2m", "45" → seconds; null when unreadable. */
export function parseResetSeconds(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  let total = 0;
  let matched = false;
  for (const part of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|m|s)/gi)) {
    matched = true;
    const value = Number(part[1]);
    const unit = part[2].toLowerCase();
    total += unit === 'ms' ? value / 1000 : unit === 'h' ? value * 3600 : unit === 'm' ? value * 60 : value;
  }
  return matched ? total : null;
}

function readNumber(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function parseRateHeaders(headers: Headers, now = Date.now()): RateWindow | null {
  const window: RateWindow = {
    limitTokens: readNumber(headers, 'x-ratelimit-limit-tokens'),
    remainingTokens: readNumber(headers, 'x-ratelimit-remaining-tokens'),
    resetTokensIn: parseResetSeconds(headers.get('x-ratelimit-reset-tokens')) ?? undefined,
    limitRequests: readNumber(headers, 'x-ratelimit-limit-requests'),
    remainingRequests: readNumber(headers, 'x-ratelimit-remaining-requests'),
    resetRequestsIn: parseResetSeconds(headers.get('x-ratelimit-reset-requests')) ?? undefined,
    at: now,
  };
  const hasAnything = window.limitTokens !== undefined || window.remainingTokens !== undefined
    || window.limitRequests !== undefined || window.remainingRequests !== undefined;
  return hasAnything ? window : null;
}
