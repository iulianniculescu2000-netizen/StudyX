import { rateLimitWaitSeconds } from '../ai/friendlyError';
import { isModelUnavailableError } from '../ai/modelHealing';

/**
 * Cotele gratuite sunt pe MODEL (Gemini 3.8 Flash: 20 de cereri pe zi, dar 3.6 Flash și 3.5 Flash-Lite au fiecare cota lor; la fel
 * gpt-oss-120b și gpt-oss-20b la Groq). Un model care și-a epuizat cota se sare până la resetare, iar următorul model al aceluiași
 * furnizor preia cererea, ca limita gratuită să fie folosită cât mai mult înainte să se treacă pe alt furnizor.
 */

/** „Quota exceeded … PerDay …”, „tokens per day”, „TPD/RPD”: cota zilnică, nu un val scurt de cereri. */
const DAILY_QUOTA = /per[ -]?day|requests per day|tokens per day|\b(?:RPD|TPD)\b|daily/i;
const RATE_LIMITED = /rate limit|429|quota|resource[ _]exhausted|too many requests/i;
/** Cheie greșită sau fără acces: restul modelelor aceluiași furnizor ar eșua la fel, deci se sar. */
const AUTH_FAILURE = /(?:^|\D)(?:401|403)(?:\D|$)|api key|unauthorized|forbidden|invalid.*key|permission denied/i;

const SHORT_COOLDOWN_MS = 60_000;
const TIMEOUT_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_DAILY_COOLDOWN_MS = 6 * 3600_000;
const MAX_COOLDOWN_MS = 26 * 3600_000;

const STORAGE_KEY = 'studyx-model-cooldowns';
const cooldownUntil = new Map<string, number>();
const keyOf = (provider: string, model: string) => `${provider}:${model}`;
let loaded = false;

/** Pauzele supraviețuiesc repornirii: altfel prima cerere de după pornire ar lovi din nou, degeaba, cota zilnică deja epuizată. */
function load(now = Date.now()): void {
  if (loaded) return;
  loaded = true;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    for (const [key, until] of Object.entries(stored)) {
      if (typeof until === 'number' && until > now && until - now <= MAX_COOLDOWN_MS) cooldownUntil.set(key, until);
    }
  } catch {
    /* fără localStorage sau date stricate: se pornește fără pauze salvate */
  }
}

function save(now = Date.now()): void {
  try {
    const live = Object.fromEntries([...cooldownUntil].filter(([, until]) => until > now));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(live));
  } catch {
    /* spațiu plin sau blocat: pauzele rămân doar în memorie */
  }
}

/** Cererea e prea mare pentru limita modelului („Requested 9500” peste „Limit 8000”): alt model sau o pauză nu o repară. */
export function isOversizedRequest(message: string): boolean {
  const requested = /requested\s+(\d+)/i.exec(message);
  const limit = /(?<![a-z])limit\s*:?\s*(\d+)/i.exec(message);
  if (requested && limit && Number(requested[1]) > Number(limit[1])) return true;
  return /request too large|reduce your message size|context length|too many tokens in (?:the )?request/i.test(message);
}

export const isDailyQuotaError = (message: string): boolean => RATE_LIMITED.test(message) && DAILY_QUOTA.test(message);
export const isAuthFailure = (message: string): boolean => AUTH_FAILURE.test(message);

/**
 * Eroarea ține de MODEL (limită/cotă epuizată sau model retras), deci merită încercat alt model al aceluiași furnizor.
 * O cheie greșită, un serviciu căzut (5xx) sau o cerere prea mare nu se rezolvă cu alt model: se trece direct la alt furnizor.
 */
export function isModelSpecificFailure(message: string, status?: number): boolean {
  if (isAuthFailure(message) || isOversizedRequest(message)) return false;
  return status === 429 || RATE_LIMITED.test(message) || isModelUnavailableError(message);
}

/** După o eroare de limită, modelul se sare: până la resetarea indicată de furnizor (zilnică) sau scurt (val de cereri). */
export function noteModelFailure(provider: string, model: string, message: string, now = Date.now()): void {
  load(now);
  // O cerere prea mare nu spune nimic despre sănătatea modelului: nu se pune în pauză.
  if (isOversizedRequest(message)) return;
  // Un model care a tăcut până la timeout se sare câteva minute: următoarele cereri nu mai pierd timp cu el.
  if (/nu a răspuns în \d+/i.test(message)) {
    cooldownUntil.set(keyOf(provider, model), now + TIMEOUT_COOLDOWN_MS);
    save(now);
    return;
  }
  if (!RATE_LIMITED.test(message)) return;
  const stated = rateLimitWaitSeconds(message);
  const daily = isDailyQuotaError(message);
  const wait = stated !== null
    ? Math.min(stated * 1000, MAX_COOLDOWN_MS)
    : daily ? DEFAULT_DAILY_COOLDOWN_MS : SHORT_COOLDOWN_MS;
  // O limită pe minut care cere o așteptare lungă nu e o pauză scurtă; una zilnică fără durată declarată rămâne 6 ore.
  cooldownUntil.set(keyOf(provider, model), now + Math.max(wait, daily ? SHORT_COOLDOWN_MS : 1000));
  save(now);
}

export function isModelCoolingDown(provider: string, model: string, now = Date.now()): boolean {
  load(now);
  const until = cooldownUntil.get(keyOf(provider, model));
  if (until === undefined) return false;
  if (until <= now) {
    cooldownUntil.delete(keyOf(provider, model));
    return false;
  }
  return true;
}

/** Momentul (ms) până la care modelul e sărit, sau null când nu e în pauză. Pentru afișare în Setări AI. */
export function modelCooldownUntil(provider: string, model: string, now = Date.now()): number | null {
  return isModelCoolingDown(provider, model, now) ? (cooldownUntil.get(keyOf(provider, model)) ?? null) : null;
}

/** Pentru teste. */
export function resetQuotaGuard(): void {
  cooldownUntil.clear();
  loaded = true;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nimic de curățat */
  }
}
