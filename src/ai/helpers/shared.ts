/**
 * Utilitare comune ale trusei de ajutători. Pur, fără rețea și fără importuri din stări/stores.
 */
import { estimateTextTokens } from '../../lib/ai/tokenBudget';
import { normalizeSearchText } from '../medicalSynonyms';

export { estimateTextTokens, normalizeSearchText };

/** Cuvinte-umplutură românești (fără diacritice), nu poartă subiect. */
export const RO_STOPWORDS: ReadonlySet<string> = new Set([
  'si', 'sau', 'de', 'la', 'in', 'din', 'pe', 'cu', 'un', 'o', 'a', 'al', 'ale', 'ai', 'cel', 'cea', 'ce', 'care', 'cum', 'cand',
  'unde', 'este', 'sunt', 'era', 'fi', 'nu', 'da', 'mi', 'ma', 'ne', 'imi', 'te', 'ti', 'va', 'se', 'pentru', 'despre',
  'mai', 'foarte', 'putin', 'prin', 'dupa', 'fara', 'intre', 'ca', 'ci', 'dar', 'le', 'lui', 'ei', 'lor', 'am', 'are',
  'au', 'rog', 'rugam', 'frumos',
]);

/** Tokenii „de conținut” ai unui text: litere mici, fără diacritice, fără stopwords. */
export function contentWords(text: string): string[] {
  return normalizeSearchText(text)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !RO_STOPWORDS.has(w));
}

/** Înlocuiește sedila (ş ţ Ş Ţ) cu virgulă (ș ț Ș Ț). Gratuit și fără pierderi. */
export function fixSedilla(text: string): string {
  return text.replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț');
}

export const HAS_SEDILLA = /[şţŞŢ]/;

/** Un mesaj gata de trimis, același format ca GroqMessage (rol + text), fără importuri de rețea. */
export interface HelperMessage {
  role: 'system' | 'user';
  content: string;
}

/** Costul (estimat) în tokeni al unui set de mesaje (+4 tokeni de încadrare per mesaj). */
export function messagesTokens(messages: readonly HelperMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTextTokens(m.content) + 4, 0);
}

/** Butoane de activare. Implicit totul oprit: ajutătorii nu schimbă nimic până nu sunt legați explicit. */
export interface HelperFlags {
  queryRewrite: boolean;
  /** Varianta LLM light a rescrierii (doar când regăsirea e slabă). */
  queryRewriteLlm: boolean;
  answerChecklist: boolean;
  clarifyGate: boolean;
  itemJudge: boolean;
  /** Rescrierea LLM a elementelor marcate slabe. */
  itemRewriteLlm: boolean;
  styleAdapter: boolean;
  selfCritique: boolean;
}

export const DEFAULT_HELPER_FLAGS: Readonly<HelperFlags> = Object.freeze({
  queryRewrite: false,
  queryRewriteLlm: false,
  answerChecklist: false,
  clarifyGate: false,
  itemJudge: false,
  itemRewriteLlm: false,
  styleAdapter: false,
  selfCritique: false,
});

export const HELPER_FLAGS_STORAGE_KEY = 'studyx.aiHelpers';

/** Citește flagurile din localStorage (`studyx.aiHelpers` = JSON parțial). Eșuează în tăcere spre implicit. */
export function readHelperFlags(storage?: Pick<Storage, 'getItem'> | null): HelperFlags {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const raw = store?.getItem(HELPER_FLAGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HELPER_FLAGS };
    const parsed = JSON.parse(raw) as Partial<HelperFlags>;
    const out = { ...DEFAULT_HELPER_FLAGS } as HelperFlags;
    for (const key of Object.keys(out) as (keyof HelperFlags)[]) {
      if (typeof parsed[key] === 'boolean') out[key] = parsed[key] as boolean;
    }
    return out;
  } catch {
    return { ...DEFAULT_HELPER_FLAGS };
  }
}
