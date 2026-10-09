

/** A timer Stop can cut short: rejects with an AbortError the moment the signal fires. */
export function sleepMs(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { abortSignal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** A 429 whose reset is further away than this is not worth waiting out inside one request. */
export const MAX_RATE_LIMIT_WAIT_MS = 8000;
/** A request with no answer after this long is dropped, so a stalled connection cannot spin the UI forever. */
export const REQUEST_TIMEOUT_MS = 90_000;
export const NON_RETRYABLE_STATUSES = new Set([400, 401, 402, 403, 404, 405, 410, 413, 422]);

export function getRetryDelayMs(attempt: number, retryAfterHeader: string | null) {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : 0;
  const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : 0;
  const exponentialBackoffMs = 2500 * 2 ** attempt;
  const jitterMs = Math.floor(Math.random() * 450);
  return Math.max(retryAfterMs, exponentialBackoffMs) + jitterMs;
}
