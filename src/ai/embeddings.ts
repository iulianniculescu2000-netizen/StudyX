import { getCached, setCached } from './cache';
import { fetchApiEmbeddings } from './apiEmbeddings';

const EMBEDDING_DIM = 256; // Mărit de la 128 → mai puțin coliziuni hash

// ─── Stopwords române medicale ───────────────────────────────────────────────
const STOPWORDS = new Set([
  'si', 'sau', 'in', 'la', 'de', 'pe', 'cu', 'ca', 'este', 'sunt', 'care',
  'din', 'pentru', 'prin', 'cel', 'cei', 'ale', 'ale', 'unui', 'unei', 'unui',
  'un', 'o', 'al', 'ai', 'sa', 'se', 'nu', 'mai', 'dar', 'daca', 'iar', 'tot',
  'fi', 'fost', 'avea', 'face', 'poate', 'poate', 'trebuie', 'poate', 'the',
  'and', 'of', 'in', 'to', 'is', 'are', 'was', 'with', 'for', 'this', 'that',
]);

// ─── Termeni medicali cu boost de importanță ─────────────────────────────────
const MEDICAL_BOOST_TERMS = new Set([
  // Generali
  'diagnostic', 'tratament', 'simptom', 'semn', 'patologie', 'sindrom',
  'boala', 'afectiune', 'maladie', 'leziune', 'inflamatie', 'infectie',
  // Anatomie
  'artera', 'vena', 'nerv', 'muschi', 'os', 'articulatie', 'organ',
  'ficat', 'rinichi', 'inima', 'pulmon', 'stomac', 'intestin', 'pancreas',
  'splina', 'tiroida', 'suprarenala', 'creier', 'maduva',
  // Farmacologie
  'medicament', 'doza', 'contraindicatie', 'efect', 'reactie', 'antibiotic',
  'inhibitor', 'agonist', 'antagonist', 'receptor',
  // Paraclinic
  'laborator', 'hemoglobina', 'leucocite', 'trombocite', 'glicemie',
  'creatinina', 'transaminaza', 'ecografie', 'radiografie', 'tomografie',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimină diacritice pentru matching robust
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function getBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return bigrams;
}

function hashToken(token: string): number {
  // FNV-1a cu seed diferit față de original — reduce coliziunile
  let hash = 2166136261 ^ 0xdeadbeef;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return Math.abs(hash);
}

/** Hash-based bag-of-words embedding — no network, no AI, works fully offline. Used as the fallback when a real embedding isn't available. */
export function embedTextLocal(text: string): number[] {
  const cached = getCached<number[]>('embedding_v2', text);
  if (cached) return cached;

  const vector = new Float64Array(EMBEDDING_DIM);
  const tokens = tokenize(text);
  const bigrams = getBigrams(tokens);

  // Unigrams cu TF weighting
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  for (const [token, freq] of tf) {
    const weight = (1 + Math.log(freq)) * (MEDICAL_BOOST_TERMS.has(token) ? 2.5 : 1.0);
    const h = hashToken(token);
    const idx = h % EMBEDDING_DIM;
    const sign = (h >>> 16) % 2 === 0 ? 1 : -1;
    vector[idx] += sign * weight;
    // Spread la vecini pentru smoothing
    vector[(idx + 1) % EMBEDDING_DIM] += sign * weight * 0.3;
    vector[(idx - 1 + EMBEDDING_DIM) % EMBEDDING_DIM] += sign * weight * 0.3;
  }

  // Bigrams cu greutate mai mică
  for (const bigram of bigrams) {
    const h = hashToken(bigram);
    const idx = h % EMBEDDING_DIM;
    const sign = (h >>> 16) % 2 === 0 ? 1 : -1;
    vector[idx] += sign * 0.6;
  }

  // Normalizare L2
  const norm = Math.sqrt(Array.from(vector).reduce((s, v) => s + v * v, 0)) || 1;
  const normalized = Array.from(vector).map(v => v / norm);

  setCached('embedding_v2', text, normalized, 48 * 60 * 60 * 1000);
  return normalized;
}

/**
 * Embeds one piece of text — a real semantic embedding via the Gemini API when
 * a Google key is configured and reachable, otherwise the local hash-based
 * fallback. The two are never mixed for the *same* text: a cache hit always
 * came from the same source as a fresh call would pick, since key availability
 * doesn't change mid-session in practice.
 */
export async function embedText(text: string): Promise<number[]> {
  const cached = getCached<number[]>('embedding_api_v1', text);
  if (cached) return cached;

  const [apiVector] = (await fetchApiEmbeddings([text])) ?? [null];
  if (apiVector) {
    setCached('embedding_api_v1', text, apiVector, 48 * 60 * 60 * 1000);
    return apiVector;
  }
  return embedTextLocal(text);
}

/**
 * Embeds many texts, batching them into as few API calls as possible instead
 * of one request per chunk — matters for vault indexing, which can be hundreds
 * of chunks. Any text the API failed to embed (or when no key is configured
 * at all) falls back to the local embedder individually, so a partial network
 * hiccup doesn't degrade the whole document to keyword-only search.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const uncached: { index: number; text: string }[] = [];
  const results: (number[] | null)[] = texts.map((text, index) => {
    const cached = getCached<number[]>('embedding_api_v1', text);
    if (!cached) uncached.push({ index, text });
    return cached;
  });

  if (uncached.length > 0) {
    const apiVectors = await fetchApiEmbeddings(uncached.map((entry) => entry.text));
    uncached.forEach(({ index, text }, i) => {
      const vector = apiVectors?.[i] ?? null;
      if (vector) {
        setCached('embedding_api_v1', text, vector, 48 * 60 * 60 * 1000);
        results[index] = vector;
      }
    });
  }

  return results.map((vector, i) => vector ?? embedTextLocal(texts[i]));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, dot); // clamp negativ la 0
}
