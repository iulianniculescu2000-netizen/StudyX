/**
 * Utilitare comune ale trusei de ajutători. Pur, fără rețea și fără importuri din stări/stores.
 */
import { normalizeSearchText } from '../medicalSynonyms';

export { normalizeSearchText };

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

/** Butoane de activare; valorile implicite sunt în `helperSettings.ts`. */
export interface HelperFlags {
  queryRewrite: boolean;
  clarifyGate: boolean;
}

export const HELPER_FLAGS_STORAGE_KEY = 'studyx.aiHelpers';
