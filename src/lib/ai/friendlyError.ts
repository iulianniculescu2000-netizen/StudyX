/**
 * Turns a raw provider/network error into one plain sentence the student can
 * act on. Provider errors carry request ids, org ids and billing URLs that are
 * noise in a chat bubble (and overflow it).
 */

/** "8.22s", "1m30.5s", "45 milliseconds", "2 minutes" → seconds, or null when no wait is stated. */
function parseWaitSeconds(text: string): number | null {
  const phrase = text.match(/(?:try again|retry)(?:\s+(?:in|after))?\s+((?:\d+(?:\.\d+)?\s*(?:milliseconds?|minutes?|seconds?|hours?|ms|h|m|s)\s*)+)/i);
  if (!phrase) return null;
  let total = 0;
  for (const part of phrase[1].matchAll(/(\d+(?:\.\d+)?)\s*(milliseconds?|minutes?|seconds?|hours?|ms|h|m|s)/gi)) {
    const value = Number(part[1]);
    const unit = part[2].toLowerCase();
    if (unit.startsWith('ms') || unit.startsWith('milli')) total += value / 1000;
    else if (unit.startsWith('h')) total += value * 3600;
    else if (unit.startsWith('m')) total += value * 60;
    else total += value;
  }
  return total > 0 ? total : null;
}

function formatWait(seconds: number): string {
  if (seconds <= 1) return 'o secundă';
  if (seconds < 90) return `${Math.ceil(seconds)} de secunde`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minute`;
  return `${Math.ceil(seconds / 3600)} ore`;
}

// Limits: provider wording differs (Groq "Rate limit", Gemini "quota"/"RESOURCE_EXHAUSTED").
const RATE_LIMIT_PATTERN = /rate limit|too many requests|quota|resource[ _]has been exhausted|resource_exhausted|tokens per minute|requests per minute|high traffic|overloaded/i;
const RATE_LIMIT_STATUS_PATTERN = /\b(?:status|http|code|error)\W{0,4}429\b/i;

/**
 * Seconds a rate-limit error says to wait before retrying, or null when the
 * error is not a rate limit or does not state a wait.
 */
export function rateLimitWaitSeconds(raw: unknown): number | null {
  const text = (raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '').trim();
  if (!text) return null;
  if (!RATE_LIMIT_PATTERN.test(text) && !RATE_LIMIT_STATUS_PATTERN.test(text)) return null;
  return parseWaitSeconds(text);
}

const LOCAL_HINT = 'Încearcă mai târziu sau așteaptă resetarea limitei.';

export function friendlyAIError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '';
  const text = message.trim();
  if (!text) return 'Nu am putut genera un răspuns. Încearcă din nou.';

  if (RATE_LIMIT_PATTERN.test(text) || RATE_LIMIT_STATUS_PATTERN.test(text)) {
    const tooBig = /requested\s+(\d+)/i.exec(text);
    const limit = /\blimit\s+(\d+)/i.exec(text);
    if (tooBig && limit && Number(tooBig[1]) > Number(limit[1])) {
      return 'Cererea e prea mare pentru limita curentă a modelului AI. Alege un capitol mai mic sau cere mai puține grile odată.';
    }
    const wait = parseWaitSeconds(text);
    if (wait !== null && wait > 3600) {
      return `Ai atins limita zilnică a modelului AI. ${LOCAL_HINT} Sau schimbă furnizorul în Setări AI.`;
    }
    return `Am atins limita de utilizare a modelului AI.${wait !== null ? ` Încearcă din nou în ${formatWait(wait)}.` : ' Așteaptă câteva secunde și încearcă din nou.'}${wait === null || wait > 120 ? ` ${LOCAL_HINT}` : ''}`;
  }

  if (/invalid api key|incorrect api key|api key not valid|unauthorized|\b(?:status|http|code|error)\W{0,4}401\b/i.test(text)) {
    return 'Cheia AI nu este validă. Verific-o în Setări AI.';
  }
  if (/failed to fetch|networkerror|network request failed|load failed|ERR_INTERNET|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(text)) {
    return 'Nu am putut contacta serviciul AI. Verifică conexiunea la internet și încearcă din nou.';
  }

  if (/\b(?:50[0-4]|52\d)\b|service unavailable|bad gateway|gateway time-?out|internal server error|temporarily unavailable/i.test(text)) {
    return 'Serviciul AI este momentan indisponibil sau supraîncărcat. Încearcă din nou în câteva secunde sau schimbă modelul.';
  }

  if (/unexpected end of json|unexpected token|is not valid json|in json at position|JSON.parse/i.test(text)) {
    return 'Răspunsul AI a venit gol sau incomplet (probabil prea mult text deodată). Încearcă din nou sau schimbă modelul.';
  }

  const cleaned = text
    .replace(/^(?:eroare\s+)?(?:(?:groq|openai|gemini|google|anthropic|mistral)\s+)?(?:api|ai)?\s*:\s*/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}…` : cleaned || 'Nu am putut genera un răspuns. Încearcă din nou.';
}
