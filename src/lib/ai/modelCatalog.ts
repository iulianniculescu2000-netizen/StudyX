/**
 * Date pure despre modele (fără rețea, fără store): numele afișate, lista de alegere și rezervele cunoscute.
 * Le folosesc și interfața (Setări AI), și vindecarea modelelor, și mesajele de eroare, fără dependențe circulare.
 */
import type { AIModel, AIProvider } from '../../store/aiStore';

export type ProviderId = AIProvider;

export interface ModelOption {
  id: AIModel;
  name: string;
  desc: string;
  speed: string;
}

/** Lista de alegere din Setări AI (ordinea = ordinea afișării). */
export const MODEL_OPTIONS: Record<ProviderId, ModelOption[]> = {
  groq: [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', desc: 'Cel mai inteligent, foarte rapid', speed: 'Rapid' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', desc: 'Ultra rapid', speed: 'Instant' },
  ],
  google: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', desc: 'Cel mai nou, rapid și inteligent', speed: 'Rapid' },
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', desc: 'Generația 4, stabil; cotă gratuită proprie (încearcă-l când 3.8 se epuizează)', speed: 'Smart' },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'Echilibrat, foarte stabil', speed: 'Rapid' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', desc: 'Cel mai economic: folosește mai puțin din limita gratuită', speed: 'Instant' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', desc: 'Cel mai bun pentru raționament', speed: 'Smart' },
  ],
  mistral: [
    { id: 'mistral-small-latest', name: 'Mistral Small', desc: 'Rapid, echilibrat', speed: 'Rapid' },
    { id: 'mistral-large-latest', name: 'Mistral Large', desc: 'Cel mai puternic, mai lent', speed: 'Smart' },
  ],
};

/**
 * Modele cunoscute ca funcționale, în ordinea preferinței (rezerve). Separat de lista de alegere: poate conține
 * modele la care se trece în tăcere, fără să fie oferite toate ca alegeri manuale.
 */
export const MODEL_CANDIDATES: Record<ProviderId, AIModel[]> = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  // 2026-08-24: confirmat live că toate modelele 2.x Gemini dau 404 „no longer available to new users”; catalogul /models le
  // mai listează, deci apartenența la catalog nu dovedește că modelul răspunde.
  // 2026-10-13, din pagina oficială de modele: stabile gemini-4-argon, gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash-lite,
  // gemini-3.1-flash-lite; gemini-3.1-pro-preview e preview (poate dispărea). Variantele „lite” sunt ultima rezervă înainte de preview.
  google: ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'],
  // Aliasuri „-latest”: documentația Mistral nu le confirmă explicit, doar un ping real. Dacă primesc 404, cererea trece pe
  // următorul furnizor (vezi `isModelSpecificFailure`), iar Setări AI le arată ca indisponibile. Nu inventăm ID-uri.
  mistral: ['mistral-small-latest', 'mistral-large-latest'],
};

const EXTRA_NAMES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
};

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  groq: 'Groq',
  google: 'Google Gemini',
  mistral: 'Mistral AI',
};

/** Nume scurt de afișat pentru un model; un ID necunoscut (descoperit la furnizor) rămâne așa cum e. */
export function modelDisplayName(id: string): string {
  const plain = id.replace(/^models\//, '');
  for (const options of Object.values(MODEL_OPTIONS)) {
    const hit = options.find((option) => option.id === plain);
    if (hit) return hit.name;
  }
  return EXTRA_NAMES[plain] ?? plain;
}

/** Furnizorul unui model cunoscut sau recognoscibil după nume; null când nu se poate spune. */
export function providerOfModel(id: string): ProviderId | null {
  const plain = id.replace(/^models\//, '');
  for (const provider of Object.keys(MODEL_CANDIDATES) as ProviderId[]) {
    if (MODEL_CANDIDATES[provider].includes(plain as AIModel) || MODEL_OPTIONS[provider].some((o) => o.id === plain)) return provider;
  }
  if (/^gemini/i.test(plain)) return 'google';
  if (/^(?:mistral|codestral|ministral|magistral|pixtral|devstral)/i.test(plain)) return 'mistral';
  if (/^openai\/|^llama|^meta-llama/i.test(plain)) return 'groq';
  return null;
}

/**
 * Formele în care furnizorii spun că un model nu există/e retras. Verificate live la Groq
 * („The model `X` does not exist or you do not have access to it.”). Două teste independente, nu un regex cu distanță:
 * ID-urile de model conțin puncte („llama-3.3-70b”) și o potrivire `model…expresie` cu `[^.]*` se rupe la primul punct.
 */
const UNAVAILABLE_PHRASE_RE = /does not exist|not[ _]found|no longer (?:exist|available|supported)|has been decommissioned|is decommissioned|deprecated/i;

export function isModelUnavailableError(message: string): boolean {
  if (/\bdecommissioned\b/i.test(message)) return true;
  return /\bmodel\b/i.test(message) && UNAVAILABLE_PHRASE_RE.test(message);
}

/** ID-ul modelului pomenit într-un mesaj de eroare („`X`”, „models/X”, „model X”), sau null. */
export function modelIdFromError(message: string): string | null {
  const ticked = /`([^`\s]+)`/.exec(message);
  if (ticked) return ticked[1].replace(/^models\//, '');
  const slashed = /\bmodels\/([\w.-]+)/i.exec(message);
  if (slashed) return slashed[1];
  const named = /\bmodel[\s:=]+["']?([\w./-]*[-/.\d][\w./-]*)/i.exec(message);
  if (named) return named[1].replace(/[.,;]+$/, '');
  const all = Object.values(MODEL_OPTIONS).flat().map((o) => o.id as string).concat(Object.values(MODEL_CANDIDATES).flat());
  return all.find((id) => message.includes(id)) ?? null;
}
