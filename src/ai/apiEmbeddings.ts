/**
 * Real embeddings via Gemini's embedding model, used opportunistically as the
 * semantic layer for the RAG vault. Independent of which provider the user has
 * picked for chat — this only needs a saved Google API key. Callers must treat
 * a `null` return as "unavailable" and fall back to the local hash-based
 * embedder (`embeddings.ts`), never as an error to surface to the user: being
 * offline or key-less is a normal, silent-degrade case here.
 */
const EMBEDDING_MODEL = 'gemini-embedding-001';
/** Matches the recommended mid-size Matryoshka cut — good quality/cost balance. */
export const API_EMBEDDING_DIM = 768;
/** Gemini's batchEmbedContents caps requests per call; stay comfortably under it. */
const BATCH_SIZE = 90;
const FETCH_TIMEOUT_MS = 8000;

function sanitizeKey(key: string): string {
  // eslint-disable-next-line no-control-regex
  return key.replace(/[^\x00-\x7F]/g, '').trim();
}

/**
 * Reads the saved Google key straight out of `aiStore`'s persisted localStorage
 * blob instead of importing the store module. This module sits under
 * `embeddings.ts`, which several tests `await import()` from inside a
 * `vi.mock('./vectorStore', ...)` factory — pulling in the real (large,
 * persist-middleware-backed) `aiStore` from there deadlocks Vitest's module
 * registry. Reading the same JSON zustand's `persist` middleware already wrote
 * avoids that import entirely, at the cost of duplicating its shape here; keep
 * this in sync with `aiStore.ts`'s `partialize`/`onRehydrateStorage` if the
 * persisted key shape ever changes.
 */
function getGoogleKey(): string | null {
  try {
    const raw = localStorage.getItem('ai-store');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { providerKeys?: Record<string, string>; provider?: string; apiKey?: string } };
    const state = parsed.state;
    if (!state) return null;
    // providerKeys.google is the normal case; pre-migration state may only have
    // a single active `apiKey` while `provider` is already 'google'.
    const fromProviderKeys = state.providerKeys?.google;
    const fromLegacyActive = state.provider === 'google' ? state.apiKey : undefined;
    const key = sanitizeKey(fromProviderKeys || fromLegacyActive || '');
    return key || null;
  } catch {
    return null;
  }
}

/** gemini-embedding-001 only auto-normalizes at its native 3072 dims; any other size needs manual L2 normalization. */
function normalizeL2(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

async function embedChunk(texts: string[], key: string): Promise<number[][] | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text: text.slice(0, 20000) }] },
            outputDimensionality: API_EMBEDDING_DIM,
          })),
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const data = await response.json() as { embeddings?: { values: number[] }[] };
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) return null;
    return data.embeddings.map((entry) => normalizeL2(entry.values));
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Embeds a batch of texts via the Gemini API in as few requests as possible.
 * Returns `null` (never throws) when no Google key is configured or the whole
 * call fails outright — callers fall back to the local embedder in that case.
 * A partial failure (one sub-batch errors) still returns the successful ones;
 * the caller fills gaps locally by index.
 */
export async function fetchApiEmbeddings(texts: string[]): Promise<(number[] | null)[] | null> {
  if (texts.length === 0) return [];
  const key = getGoogleKey();
  if (!key) return null;

  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  let anySucceeded = false;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const embedded = await embedChunk(slice, key);
    if (embedded) {
      anySucceeded = true;
      embedded.forEach((vector, offset) => { results[i + offset] = vector; });
    }
  }

  return anySucceeded ? results : null;
}
