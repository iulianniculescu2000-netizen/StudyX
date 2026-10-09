import { cosineSimilarity, embedText } from './embeddings';
import { getVaultChunks } from './vectorStore';
import { expandMedicalQuery } from './medicalSynonyms';
import { tokenizeExpansionPhrase, tokenizeForSearch } from './searchText';
import type { ChunkRecord, RetrievedChunk, UserProfileData } from './types';

/**
 * Calea UNICĂ de retrieval din Biblioteca AI (chat, context pentru model, agent, QuizPlay):
 * BM25 lexical (fără diacritice, cu stemare ușoară) + similaritate semantică, cu expandarea
 * abrevierilor medicale, reranking euristic, prag adaptiv și diversitate (MMR).
 * `searchVault` din vectorStore rămâne doar o primitivă (cosinus pur).
 */

// ─── BM25 Parameters ──────────────────────────────────────────────────────────
const BM25_K1 = 1.5;  // saturation term frequency
const BM25_B = 0.75;  // length normalization
/** Greutatea unui termen adus de expandare (abreviere ↔ formă completă) față de unul scris de utilizator. */
const EXPANSION_WEIGHT = 0.7;
/** Scorul minim absolut; peste el se aplică și un prag relativ la cel mai bun rezultat. */
const ABSOLUTE_FLOOR = 0.05;
const RELATIVE_FLOOR = 0.2;
/** MMR: 1 = doar relevanță, 0 = doar diversitate. */
const MMR_LAMBDA = 0.6;
/** Similaritate de la care două chunk-uri sunt considerate același conținut. */
const NEAR_DUPLICATE = 0.8;

interface DocIndex {
  tokens: string[];
  tf: Map<string, number>;
  bigrams: Set<string>;
  headingTokens: Set<string>;
}

const docCache = new Map<string, DocIndex>();
const DOC_CACHE_LIMIT = 30000;

function indexDoc(chunk: Pick<ChunkRecord, 'id' | 'text' | 'heading' | 'topic'>): DocIndex {
  const key = `${chunk.id}:${chunk.text.length}:${chunk.heading ?? ''}`;
  const cached = docCache.get(key);
  if (cached) return cached;

  const tokens = tokenizeForSearch(chunk.text);
  const tf = new Map<string, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i += 1) bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  const headingTokens = new Set(tokenizeForSearch(`${chunk.heading ?? ''} ${chunk.topic ?? ''}`));

  if (docCache.size >= DOC_CACHE_LIMIT) docCache.clear();
  const index = { tokens, tf, bigrams, headingTokens };
  docCache.set(key, index);
  return index;
}

interface WeightedQuery {
  /** Termenii scriși de utilizator (stemați), fără duplicate. */
  base: string[];
  /** Termeni suplimentari din expandare. */
  expansion: string[];
  weights: Map<string, number>;
  bigrams: string[];
}

function buildQuery(query: string): WeightedQuery {
  const base = [...new Set(tokenizeForSearch(query))];
  const weights = new Map<string, number>(base.map((token) => [token, 1]));

  const expansion: string[] = [];
  for (const phrase of expandMedicalQuery(query).phrases) {
    for (const token of tokenizeExpansionPhrase(phrase)) {
      if (weights.has(token)) continue;
      weights.set(token, EXPANSION_WEIGHT);
      expansion.push(token);
    }
  }

  const ordered = tokenizeForSearch(query);
  const bigrams: string[] = [];
  for (let i = 0; i < ordered.length - 1; i += 1) bigrams.push(`${ordered[i]} ${ordered[i + 1]}`);
  return { base, expansion, weights, bigrams };
}

function buildIdfMap(terms: string[], docs: DocIndex[]): Map<string, number> {
  const N = docs.length;
  const map = new Map<string, number>();
  for (const term of terms) {
    let df = 0;
    for (const doc of docs) if (doc.tf.has(term)) df += 1;
    map.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }
  return map;
}

function bm25Score(query: WeightedQuery, doc: DocIndex, avgDocLength: number, idf: Map<string, number>): number {
  const docLen = doc.tokens.length;
  let score = 0;
  for (const [term, weight] of query.weights) {
    const tf = doc.tf.get(term) ?? 0;
    if (tf === 0) continue;
    const numerator = tf * (BM25_K1 + 1);
    const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / avgDocLength));
    score += weight * (idf.get(term) ?? 0) * (numerator / denominator);
  }
  return score;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Similaritate Jaccard (cuvinte) de la care două chunk-uri sunt tratate ca același text. */
const OVERLAP_DUPLICATE = 0.9;
/** Câte candidate (sortate după scor) se compară între ele la dedupe. */
const DEDUPE_WINDOW = 80;

function hasPage(result: RetrievedChunk): boolean {
  return typeof result.page === 'number' || typeof result.printedPage === 'number';
}

/**
 * Scoate dublurile aproape identice dintre surse diferite (PDF „Capitole întregi” vs. PDF pe secțiuni). Lista vine sortată după scor:
 * primul exemplar câștigă, cu o excepție — dacă are scor aproape egal și o dublă are pagină iar el nu,
 * rămâne cea cu pagină (citarea trebuie să poată deschide cartea).
 */
function dedupeOverlapping<T extends { result: RetrievedChunk; doc: DocIndex }>(sorted: T[]): T[] {
  const kept: T[] = [];
  const sets = new Map<T, Set<string>>();
  sorted.forEach((entry, position) => {
    if (position >= DEDUPE_WINDOW) {
      kept.push(entry);
      return;
    }
    const tokens = new Set(entry.doc.tokens);
    const twinIndex = kept.findIndex((other) => {
      const otherTokens = sets.get(other);
      if (otherTokens === undefined) return false;
      // Doar între surse diferite (PDF-uri suprapuse); dublurile din aceeași sursă le tratează MMR.
      const a = entry.result.sourceId;
      const b = other.result.sourceId;
      if (!a || !b || a === b) return false;
      return jaccard(tokens, otherTokens) >= OVERLAP_DUPLICATE;
    });
    if (twinIndex < 0) {
      kept.push(entry);
      sets.set(entry, tokens);
      return;
    }
    const twin = kept[twinIndex];
    if (!hasPage(twin.result) && hasPage(entry.result) && entry.result.score >= twin.result.score * 0.95) {
      kept[twinIndex] = entry;
      sets.delete(twin);
      sets.set(entry, tokens);
    }
  });
  return kept;
}

export interface RetrievalScope {
  /** Titluri/capitole acceptate (ex. titlul capitolului curricular și al topicului). */
  headings?: string[];
  /** Interval de pagini PDF (inclusiv); se aplică doar chunk-urilor din `sourceId`, dacă e dat. */
  pageStart?: number;
  pageEnd?: number;
  sourceId?: string;
}

export interface RetrievalFilters {
  /** Doar aceste surse. */
  sourceIds?: string[];
  /** Surse de ignorat (ex. în curs de indexare sau cu eroare). */
  excludeSourceIds?: string[];
  /** Capitolul/secțiunea în care se află studentul acum: chunk-urile din el urcă ușor în clasament. */
  activeHeading?: string;
  /**
   * Zona din carte în care se află studentul (capitol/topic curricular). Chunk-urile al căror titlu,
   * capitol sau interval de pagini se potrivește urcă în clasament; restul nu sunt excluse.
   */
  activeScope?: RetrievalScope;
  /** `false` oprește MMR (rezultate pur după scor). Implicit activ. */
  diversify?: boolean;
}

/** Ce are nevoie `rankChunks` dintr-un chunk; `ChunkRecord` se potrivește. */
export type RankableChunk = Pick<ChunkRecord, 'id' | 'text' | 'topic' | 'source' | 'embedding'> &
  Partial<Pick<ChunkRecord, 'sourceId' | 'difficulty' | 'heading' | 'page' | 'pageEnd' | 'printedPage' | 'chapter'>>;

/** Cât de bine se potrivește chunk-ul cu zona activă: 0 (deloc) … 1 (titlu exact). */
function scopeMatch(
  chunk: RankableChunk,
  scope: { headings: string[]; pageStart?: number; pageEnd?: number; sourceId?: string } | null,
): number {
  if (!scope) return 0;
  let best = 0;
  const own = [normalizeHeading(chunk.heading), normalizeHeading(chunk.chapter)].filter(Boolean);
  for (const wanted of scope.headings) {
    for (const have of own) {
      if (have === wanted) return 1;
      // „Hipertensiunea arterială esențială” ~ „Hipertensiunea arterială”.
      if (have.includes(wanted) || wanted.includes(have)) best = Math.max(best, 0.6);
    }
  }
  if (scope.pageStart !== undefined && typeof chunk.page === 'number' && (!scope.sourceId || chunk.sourceId === scope.sourceId)) {
    const end = scope.pageEnd ?? scope.pageStart;
    const chunkEnd = chunk.pageEnd ?? chunk.page;
    if (chunk.page <= end && chunkEnd >= scope.pageStart) best = Math.max(best, 0.8);
  }
  return best;
}

function normalizeHeading(value: string | undefined): string {
  return value ? tokenizeForSearch(value).join(' ') : '';
}

/**
 * Nucleul pur (fără IndexedDB, fără rețea): ordonează chunk-urile pentru o interogare. Exportat
 * pentru teste și pentru apelanți care au deja chunk-urile și vectorul interogării.
 */
export function rankChunks(
  query: string,
  chunks: RankableChunk[],
  queryEmbedding: number[],
  userProfile: UserProfileData | null,
  k: number,
  filters: Pick<RetrievalFilters, 'activeHeading' | 'activeScope' | 'diversify'> = {},
): RetrievedChunk[] {
  if (!query.trim() || chunks.length === 0 || k <= 0) return [];

  const wq = buildQuery(query);
  if (wq.weights.size === 0 && queryEmbedding.length === 0) return [];

  // Derived from measured accuracy, NOT from the mistake list: this used to read
  // `recentMistakes` — the very array `recentMistakeTopics` below uses — so a
  // single recent mistake quietly earned a topic both boosts (0.30 + 0.20).
  const weakTopics = new Set(
    Object.entries(userProfile?.topicAccuracy ?? {})
      .filter(([, performance]) => performance.total >= 3 && performance.accuracy < 60)
      .map(([topic]) => topic.toLowerCase()),
  );
  // mistakeBank și recentMistakes conțin topicuri (string-uri), nu chunk IDs.
  const mistakeBankTopics = new Set(
    (userProfile?.mistakeBank ?? []).map((m) => m.topic?.toLowerCase()).filter(Boolean),
  );
  const recentMistakeTopics = new Set(
    (userProfile?.recentMistakes ?? []).map((m) => m.topic.toLowerCase()),
  );

  const docs = chunks.map(indexDoc);
  const avgDocLength = docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / (docs.length || 1) || 1;
  const idf = buildIdfMap([...wq.weights.keys()], docs);

  // Normalizare BM25: raportată la termenii scriși de utilizator (expandarea nu o dilată).
  const maxBm25 = Math.max(wq.base.length, 1) * Math.log(chunks.length + 1);
  const baseIdfTotal = wq.base.reduce((sum, term) => sum + (idf.get(term) ?? 0), 0) || 1;

  // Ponderi adaptive după lungimea interogării: scurt (cuvinte-cheie) → BM25; lung (limbaj natural) → semantic.
  const queryLen = query.trim().length;
  const bm25Weight = queryLen <= 25 ? 0.65 : queryLen <= 60 ? 0.55 : 0.42;
  const semanticWeight = queryLen <= 25 ? 0.12 : queryLen <= 60 ? 0.25 : 0.38;
  const activeHeading = normalizeHeading(filters.activeHeading);
  const scopeHeadings = (filters.activeScope?.headings ?? []).map(normalizeHeading).filter((heading) => heading.length >= 3);
  const scope = filters.activeScope && (scopeHeadings.length > 0 || filters.activeScope.pageStart !== undefined)
    ? { headings: scopeHeadings, pageStart: filters.activeScope.pageStart, pageEnd: filters.activeScope.pageEnd, sourceId: filters.activeScope.sourceId }
    : null;

  const scored = chunks.map((chunk, i) => {
    const doc = docs[i];
    const dimMismatch = queryEmbedding.length > 0 && chunk.embedding.length !== queryEmbedding.length;
    const semanticScore = dimMismatch ? 0 : (queryEmbedding.length ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0);
    const rawBm25 = bm25Score(wq, doc, avgDocLength, idf);
    const bm25Normalized = maxBm25 > 0 ? Math.min(rawBm25 / maxBm25, 1) : 0;

    const topic = chunk.topic.toLowerCase();
    const weaknessBoost = weakTopics.has(topic) ? 0.30 : 0;
    const recencyBoost = recentMistakeTopics.has(topic) ? 0.20 : 0;
    const mistakeBankBoost = mistakeBankTopics.has(topic) ? 0.15 : 0;

    // Reranking euristic (multiplicativ, modest): acoperirea termenilor ponderată cu IDF (densitate de
    // termeni distincți, nu repetări), fraze întregi (bigrame: „fibrilatie atrial"), potrivire cu
    // titlul secțiunii și apropiere de capitolul activ.
    let covered = 0;
    for (const term of wq.base) if (doc.tf.has(term)) covered += idf.get(term) ?? 0;
    const coverage = covered / baseIdfTotal;
    let phraseHits = 0;
    for (const bigram of wq.bigrams) if (doc.bigrams.has(bigram)) phraseHits += 1;
    const phrase = wq.bigrams.length ? phraseHits / wq.bigrams.length : 0;
    let headingHits = 0;
    for (const term of wq.base) if (doc.headingTokens.has(term)) headingHits += 1;
    const headingMatch = wq.base.length ? headingHits / wq.base.length : 0;
    const chapterMatch = activeHeading && normalizeHeading(chunk.heading) === activeHeading ? 1 : 0;
    const rerank = 1 + 0.25 * coverage + 0.2 * phrase + 0.15 * headingMatch + 0.12 * chapterMatch + 0.3 * scopeMatch(chunk, scope);

    // Personalization SCALES relevance instead of being added to it. Added flat, the three boosts
    // summed to 0.65 — enough for a chunk with zero keyword and near-zero semantic match to outrank
    // a perfectly relevant one purely because its topic appeared in the mistake list.
    // Chunk-uri indexate la altă dimensiune de embeddings (cheie Google adăugată/scoasă între sesiuni) nu pot fi
    // comparate semantic: primesc întreaga pondere BM25, nu un 0 semantic care le-ar scufunda nedrept în clasament.
    const effBm25Weight = dimMismatch ? 1 : bm25Weight;
    const effSemanticWeight = dimMismatch ? 0 : semanticWeight;
    const relevance = bm25Normalized * effBm25Weight + semanticScore * effSemanticWeight;
    const personalBoost = weaknessBoost + recencyBoost + mistakeBankBoost;
    const score = relevance * rerank * (1 + personalBoost);

    return {
      chunk,
      doc,
      result: {
        id: chunk.id,
        sourceId: chunk.sourceId,
        text: chunk.text,
        topic: chunk.topic,
        source: chunk.source,
        difficulty: chunk.difficulty ?? 'medium',
        score,
        keywordScore: bm25Normalized,
        semanticScore,
        recencyBoost,
        weaknessBoost,
        ...(typeof chunk.page === 'number' ? { page: chunk.page } : {}),
        ...(typeof chunk.pageEnd === 'number' ? { pageEnd: chunk.pageEnd } : {}),
        ...(typeof chunk.printedPage === 'number' ? { printedPage: chunk.printedPage } : {}),
        ...(chunk.heading ? { heading: chunk.heading } : {}),
        ...(chunk.chapter ? { chapter: chunk.chapter } : {}),
      } as RetrievedChunk,
    };
  });

  scored.sort((a, b) => b.result.score - a.result.score);
  const top = scored[0]?.result.score ?? 0;
  // Prag adaptiv: absolut (ca înainte) + relativ la cel mai bun, ca un rezultat slab să nu umple lista
  // când există unul foarte bun.
  const threshold = Math.max(ABSOLUTE_FLOOR, top * RELATIVE_FLOOR);
  const candidates = scored.filter((entry) => entry.result.score > threshold || (entry === scored[0] && entry.result.score > ABSOLUTE_FLOOR));
  if (candidates.length === 0) return [];

  // Același text indexat de două ori (PDF „Capitole întregi” + PDF pe secțiuni): rămâne un singur
  // exemplar, indiferent de MMR.
  const unique = dedupeOverlapping(candidates);

  if (filters.diversify === false || unique.length <= 1) {
    return unique.slice(0, k).map((entry) => entry.result);
  }

  // MMR pe un grup de candidați limitat (sortat deja): relevanță normalizată vs. similaritate cu ce s-a ales.
  const pool = unique.slice(0, Math.max(k * 4, 24));
  const selected: typeof pool = [];
  const tokenSets = new Map(pool.map((entry) => [entry, new Set(entry.doc.tokens)]));
  while (selected.length < k && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const entry = pool[i];
      const relevance = entry.result.score / top;
      let redundancy = 0;
      for (const chosen of selected) {
        const similarity = Math.max(
          cosineSimilarity(entry.chunk.embedding, chosen.chunk.embedding),
          jaccard(tokenSets.get(entry)!, tokenSets.get(chosen)!),
        );
        // Aproape-dublură (alte pagini/ediții cu același text): penalizare dură.
        const penalty = similarity >= NEAR_DUPLICATE ? similarity + 1 : similarity;
        if (penalty > redundancy) redundancy = penalty;
      }
      const value = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }
  return selected.map((entry) => entry.result);
}

export async function retrieveRelevantChunks(
  query: string,
  userProfile: UserProfileData | null,
  k = 10,
  filters?: RetrievalFilters,
): Promise<RetrievedChunk[]> {
  if (!query) return [];

  const sourceIds = filters?.sourceIds ?? [];
  const excluded = new Set(filters?.excludeSourceIds ?? []);
  const allChunks = (await getVaultChunks()).filter((chunk) => {
    if (chunk.sourceId && excluded.has(chunk.sourceId)) return false;
    return sourceIds.length === 0 || (chunk.sourceId ? sourceIds.includes(chunk.sourceId) : false);
  });
  if (allChunks.length === 0) return [];

  const queryEmbedding = await embedText(query);
  return rankChunks(query, allChunks, queryEmbedding, userProfile, k, filters);
}
