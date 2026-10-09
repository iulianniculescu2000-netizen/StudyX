

/**
 * Providers don't agree on an error shape: Groq/Google follow the OpenAI
 * `{error:{message}}` convention, but some providers return FastAPI-style
 * `{detail: "..."}` — sometimes `detail` is even an array of validation
 * objects. Reading only `.error.message` would fall through to
 * `res.statusText`, which some fetch implementations leave empty. This checks
 * every shape API providers actually use.
 */
export async function extractApiErrorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as
    | { error?: { message?: string } | string; detail?: string | Array<{ msg?: string }>; message?: string }
    | null;
  let message: string | null = null;
  if (body) {
    if (typeof body.error === 'string') message = body.error;
    else if (body.error?.message) message = body.error.message;
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

/** An error another attempt cannot fix (bad key, oversized request, a limit that resets in minutes). */
export class NonRetryableError extends Error {}

/** The request itself was refused (too big, malformed) — retrying elsewhere is fine, but it does not mean the provider is down. */
export function isRequestSpecificError(message: string): boolean {
  return /\b(?:400|413|422)\b|request too large|too large|bad request|invalid request|context length/i.test(message);
}
