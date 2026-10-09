import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setAiStoreState = (state: Record<string, unknown>) => {
  localStorage.setItem('ai-store', JSON.stringify({ state, version: 0 }));
};

describe('fetchApiEmbeddings — multi-key setups', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips the network entirely when only Groq/Mistral keys are saved (no Google key)', async () => {
    setAiStoreState({ provider: 'groq', providerKeys: { groq: 'gsk_xxx', mistral: 'mk_xxx' } });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchApiEmbeddings } = await import('./apiEmbeddings');
    const result = await fetchApiEmbeddings(['fibrilatie atriala']);

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the Google key when present even if a different provider is active for chat', async () => {
    setAiStoreState({ provider: 'groq', providerKeys: { groq: 'gsk_xxx', google: 'AIza_yyy' } });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [{ values: new Array(768).fill(0.1) }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchApiEmbeddings } = await import('./apiEmbeddings');
    const result = await fetchApiEmbeddings(['fibrilatie atriala']);

    expect(result).not.toBeNull();
    expect(result?.[0]).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('batchEmbedContents');
    expect(init.headers['x-goog-api-key']).toBe('AIza_yyy');
  });

  it('degrades silently (returns null, no throw) when the Google key is rate-limited (429)', async () => {
    setAiStoreState({ provider: 'google', providerKeys: { google: 'AIza_ratelimited' } });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchApiEmbeddings } = await import('./apiEmbeddings');
    await expect(fetchApiEmbeddings(['x'])).resolves.toBeNull();
  });

  it('embedText/embedBatch fall back to the local embedder end-to-end on API failure', async () => {
    setAiStoreState({ provider: 'google', providerKeys: { google: 'AIza_down' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { embedText, embedBatch } = await import('./embeddings');
    const single = await embedText('insuficienta renala acuta');
    const batch = await embedBatch(['a', 'b', 'c']);

    expect(single.length).toBe(256); // local hash-based dim, proves it fell back
    expect(batch).toHaveLength(3);
    batch.forEach((v) => expect(v.length).toBe(256));
  });

  it('falls back to legacy `apiKey` when provider is google but providerKeys.google is not migrated yet', async () => {
    setAiStoreState({ provider: 'google', apiKey: 'AIza_legacy', providerKeys: {} });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [{ values: new Array(768).fill(0.2) }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchApiEmbeddings } = await import('./apiEmbeddings');
    const result = await fetchApiEmbeddings(['x']);
    expect(result).not.toBeNull();
    expect(fetchSpy.mock.calls[0][1].headers['x-goog-api-key']).toBe('AIza_legacy');
  });
});
