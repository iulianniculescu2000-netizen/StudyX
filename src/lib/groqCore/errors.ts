

/**
 * Providers don't agree on an error shape: Groq/Google follow the OpenAI
 * `{error:{message}}` convention, but some providers return FastAPI-style
 * `{detail: "..."}` — sometimes `detail` is even an array of validation
 * objects. Reading only `.error.message` would fall through to
 * `res.statusText`, which some fetch implementations leave empty. This checks
 * every shape API providers actually use.
 */
export async function extractApiErrorMessage(res: Response): Promise<string> {
  const parsed = await res.json().catch(() => null) as unknown;
  // Google (compatibilitatea OpenAI) întoarce uneori erorile ca listă: [{"error":{"code":429,"status":"RESOURCE_EXHAUSTED",...}}].
  const body = (Array.isArray(parsed) ? parsed[0] : parsed) as
    | { error?: { message?: string; status?: string; details?: unknown } | string; detail?: string | Array<{ msg?: string }>; message?: string }
    | null
    | undefined;
  let message: string | null = null;
  if (body) {
    if (typeof body.error === 'string') message = body.error;
    else if (body.error?.message) message = quotaHint(body.error.status, body.error.details, body.error.message);
    else if (typeof body.error === 'object' && body.error?.status) message = `${body.error.status} (HTTP ${res.status})`;
    else if (typeof body.detail === 'string') message = body.detail;
    else if (Array.isArray(body.detail) && body.detail.length > 0) {
      message = body.detail.map((d) => d.msg).filter(Boolean).join('; ') || JSON.stringify(body.detail);
    }
    else if (body.message) message = body.message;
  }
  message ??= res.statusText || `HTTP ${res.status}`;

  // 402 is the one status where the raw provider text (usually terse English,
  // e.g. Google's "Payment required to access this resource") leaves the user
  // with no idea what to actually do — unlike 401/403/429, which already get
  // a clear Romanian message elsewhere. Append actionable guidance instead of
  // just passing the raw string through to the chat bubble.
  if (res.status === 402) {
    return `${message} — cheia API a atins limita gratuită și necesită activarea facturării la provider, sau schimbă providerul din Setări AI.`;
  }
  return message;
}

/**
 * Gemini descrie cota depășită în `details` (QuotaFailure): „limit: 0” pe nivelul gratuit înseamnă că modelul nu are deloc
 * cotă gratuită pentru cheia respectivă, nu că cererile sunt prea dese. Se adaugă metrica și limita ca să se vadă motivul real.
 */
function quotaHint(status: string | undefined, details: unknown, message: string): string {
  const violations = Array.isArray(details)
    ? details.flatMap((detail) => (detail && typeof detail === 'object' && Array.isArray((detail as { violations?: unknown }).violations) ? (detail as { violations: unknown[] }).violations : []))
    : [];
  const first = violations.find((violation): violation is { quotaMetric?: string; quotaId?: string } => !!violation && typeof violation === 'object');
  const metric = first?.quotaId ?? first?.quotaMetric;
  const suffix = [status, metric].filter(Boolean).join(', ');
  return suffix && !message.includes(suffix) ? `${message} [${suffix}]` : message;
}

/** An error another attempt cannot fix (bad key, oversized request, a limit that resets in minutes). */
export class NonRetryableError extends Error {}

/** The request itself was refused (too big, malformed) — retrying elsewhere is fine, but it does not mean the provider is down. */
export function isRequestSpecificError(message: string): boolean {
  return /\b(?:400|413|422)\b|request too large|too large|bad request|invalid request|context length/i.test(message);
}
