/**
 * (a) queryRewrite — normalizează întrebarea pentru RAG.
 *
 * Local (0 tokeni): scoate formulele de politețe/comandă („te rog, explică-mi ce este…”), repară
 * sedila, expandează abrevieri și sinonime RO↔EN și produce un text de căutare scurt.
 * LLM light (opțional, ~70 tokeni): DOAR dacă scorul de regăsire de la prima încercare a fost slab.
 */
import { expandMedicalQuery, normalizeSearchText } from '../medicalSynonyms';
import { contentWords, fixSedilla } from './shared';

/** Termeni EN → RO (fără diacritice). Doar echivalențe certe, frecvente în cărți/cursuri. */
export const EN_RO_TERMS: readonly (readonly [string, string])[] = [
  ['myocardial infarction', 'infarct miocardic'],
  ['heart failure', 'insuficienta cardiaca'],
  ['atrial fibrillation', 'fibrilatie atriala'],
  ['hypertension', 'hipertensiune arteriala'],
  ['diabetes mellitus', 'diabet zaharat'],
  ['pulmonary embolism', 'tromboembolism pulmonar'],
  ['deep vein thrombosis', 'tromboza venoasa profunda'],
  ['chronic kidney disease', 'boala cronica de rinichi'],
  ['stroke', 'accident vascular cerebral'],
  ['pneumonia', 'pneumonie'],
  ['cirrhosis', 'ciroza hepatica'],
  ['pancreatitis', 'pancreatita'],
  ['anemia', 'anemie'],
];

/** Prefixe de comandă/politețe scoase din fața subiectului (pe text cu diacritice, insensibil la majuscule). */
const FILLER_PREFIX =
  /^(?:te rog(?: frumos)?[,\s]+|po[tț]i s[aă](?:-mi)? |spune-mi |zi-mi |explic[aă](?:-mi)? |ce (?:este|e|inseamn[aă]|înseamnă) |care (?:este|e|sunt) |ce [sș]tii despre |vorbe[sș]te-mi despre |detalii despre |informa[tț]ii despre |am nevoie de |vreau s[aă] [sș]tiu |despre )+/i;

export interface QueryRewriteOptions {
  /** Scorul cel mai bun de regăsire (0-1) de la prima încercare, dacă există. */
  lastRetrievalScore?: number;
  /** Sub acest scor se recomandă rescrierea LLM (implicit 0.35). */
  weakThreshold?: number;
  maxSearchChars?: number;
}

export interface QueryRewrite {
  original: string;
  /** Subiectul curățat (cu diacritice reparate, fără formule de comandă). */
  core: string;
  /** Fraze suplimentare (fără diacritice): forma completă / abrevierea / echivalentul RO. */
  expansions: string[];
  /** Textul de căutare final: core + expansiuni, plafonat. */
  searchText: string;
  /** True dacă regăsirea a fost slabă și merită un apel LLM light. */
  needsLlm: boolean;
}

export function rewriteQuery(query: string, options: QueryRewriteOptions = {}): QueryRewrite {
  const { lastRetrievalScore, weakThreshold = 0.35, maxSearchChars = 220 } = options;
  let core = fixSedilla(query).replace(/\s+/g, ' ').trim().replace(/[?!.]+$/g, '').trim();
  const stripped = core.replace(FILLER_PREFIX, '').trim();
  // Nu goli întrebarea dacă după curățare nu rămâne subiect.
  if (contentWords(stripped).length > 0) core = stripped;

  const expansions: string[] = [];
  const add = (p: string) => {
    if (p && !expansions.includes(p)) expansions.push(p);
  };
  expandMedicalQuery(core).phrases.forEach(add);

  const norm = ` ${normalizeSearchText(core)} `;
  for (const [en, ro] of EN_RO_TERMS) {
    if (norm.includes(` ${en} `)) {
      add(ro);
      expandMedicalQuery(ro).phrases.forEach(add);
    }
  }

  const joined = [core, ...expansions].join(' ');
  const searchText = joined.length > maxSearchChars ? joined.slice(0, maxSearchChars).replace(/\s+\S*$/, '') : joined;
  const needsLlm = lastRetrievalScore !== undefined && lastRetrievalScore < weakThreshold && contentWords(core).length >= 2;
  return { original: query, core, expansions, searchText, needsLlm };
}
