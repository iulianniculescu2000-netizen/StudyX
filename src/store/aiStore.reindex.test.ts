import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('../lib/idb', () => ({
  idbGet: async (key: string) => db.get(key),
  idbSet: async (key: string, value: unknown) => { db.set(key, value); },
  idbRemove: async (key: string) => { db.delete(key); },
}));

let failEmbedding = false;
let embedGate: Promise<void> | null = null;
vi.mock('../ai/embeddings', () => ({
  embedBatch: async (texts: string[]) => {
    if (embedGate) await embedGate;
    if (failEmbedding) throw new Error('embedding down');
    return texts.map(() => [0, 1]);
  },
  embedText: async () => [0, 1],
  cosineSimilarity: () => 0,
}));

import { useAIStore } from './aiStore';
import { bumpProfileEpoch } from './profileEpoch';
import { extractPageMap, pageMarker, rememberPageMap } from '../ai/pageMarkers';
import { addChunksToVault, getVaultChunksBySource, setVectorStoreProfile } from '../ai/vectorStore';

const para = (n: number) =>
  `Capitolul ${n} discută hipertensiunea arterială și complicațiile ei cardiovasculare, tratamentul și monitorizarea pacientului pe termen lung. `.repeat(8);

/** Text de PDF cu markeri de pagină, trecut prin canalul parser → indexare ca în aplicație. */
function pagedText(pages = 12): string {
  const raw = Array.from({ length: pages }, (_, i) => pageMarker(i + 1, i + 100) + para(i + 1)).join('\n');
  const { text: untrimmed, pages: map } = extractPageMap(raw);
  const text = untrimmed.trim(); // parsePDF returns trimmed text; the fingerprint depends on it
  rememberPageMap(text, map);
  return text;
}
const plainText = () => Array.from({ length: 12 }, (_, i) => para(i + 1)).join('\n').trim();

const OLD = [
  { id: 'old1', text: 'fragment vechi unu despre hipertensiune' },
  { id: 'old2', text: 'fragment vechi doi despre hipertensiune' },
  { id: 'old3', text: 'fragment vechi trei despre hipertensiune' },
];

async function seedSource(id: string, type: 'pdf' | 'docx' = 'pdf') {
  await addChunksToVault(OLD, 'Kumar.pdf', id);
  useAIStore.setState({
    knowledgeSources: [{
      id, name: 'Kumar.pdf', type, preview: '', charCount: 100, wordCount: 10, chunkCount: OLD.length,
      qualityScore: 80, addedAt: 1, indexStatus: 'ready', indexProgress: 100, folderId: 'folder-rezi',
    }],
  });
}

beforeEach(async () => {
  db.clear();
  failEmbedding = false;
  embedGate = null;
  await setVectorStoreProfile('p1');
  useAIStore.setState({ knowledgeSources: [] });
});

describe('findSourcesWithoutPages', () => {
  it('flags ready PDF sources whose chunks have no page, not paged or non-PDF ones', async () => {
    await seedSource('s-old');
    await addChunksToVault([{ id: 'n1', text: 'text nou', page: 3 }], 'Nou.pdf', 's-new');
    await addChunksToVault(OLD, 'Curs.docx', 's-docx');
    useAIStore.setState((state) => ({
      knowledgeSources: [
        ...state.knowledgeSources,
        { ...state.knowledgeSources[0], id: 's-new', name: 'Nou.pdf' },
        { ...state.knowledgeSources[0], id: 's-docx', name: 'Curs.docx', type: 'docx' },
        { ...state.knowledgeSources[0], id: 's-busy', indexStatus: 'indexing' },
      ],
    }));
    expect(await useAIStore.getState().findSourcesWithoutPages()).toEqual(['s-old']);
  });
});

describe('reindexKnowledgeSource', () => {
  it('replaces the old chunks with paged ones, same id/folder/name, no duplicates', async () => {
    await seedSource('s1');
    const updated = await useAIStore.getState().reindexKnowledgeSource('s1', pagedText());

    const chunks = await getVaultChunksBySource('s1');
    expect(chunks.length).toBe(updated.chunkCount);
    expect(chunks.some((chunk) => chunk.id.startsWith('old'))).toBe(false);
    expect(new Set(chunks.map((chunk) => chunk.id)).size).toBe(chunks.length);
    expect(chunks.every((chunk) => typeof chunk.page === 'number')).toBe(true);
    expect(chunks.some((chunk) => chunk.printedPage !== undefined)).toBe(true);

    const index = db.get('studyx-vectors-index-v2:p1') as Array<{ sourceId: string }>;
    expect(index.filter((entry) => entry.sourceId === 's1')).toHaveLength(1);
    const source = useAIStore.getState().knowledgeSources.find((s) => s.id === 's1')!;
    expect(source).toMatchObject({ id: 's1', name: 'Kumar.pdf', folderId: 'folder-rezi', indexStatus: 'ready' });
    expect(useAIStore.getState().knowledgeSources).toHaveLength(1);
    expect(await useAIStore.getState().findSourcesWithoutPages()).toEqual([]);
  });

  it('a second reindex replaces rather than appends', async () => {
    await seedSource('s1');
    await useAIStore.getState().reindexKnowledgeSource('s1', pagedText());
    const first = (await getVaultChunksBySource('s1')).length;
    await useAIStore.getState().reindexKnowledgeSource('s1', pagedText());
    expect((await getVaultChunksBySource('s1')).length).toBe(first);
  });

  it('keeps the old chunks when embedding fails', async () => {
    await seedSource('s1');
    failEmbedding = true;
    await expect(useAIStore.getState().reindexKnowledgeSource('s1', pagedText())).rejects.toThrow('embedding down');
    expect((await getVaultChunksBySource('s1')).map((chunk) => chunk.id)).toEqual(['old1', 'old2', 'old3']);
    expect(useAIStore.getState().knowledgeSources[0]).toMatchObject({ indexStatus: 'ready', chunkCount: 3 });
  });

  it('keeps the old chunks when the new text carries no page numbers', async () => {
    await seedSource('s1');
    await expect(useAIStore.getState().reindexKnowledgeSource('s1', plainText())).rejects.toThrow(/numerele paginilor/);
    expect((await getVaultChunksBySource('s1')).map((chunk) => chunk.id)).toEqual(['old1', 'old2', 'old3']);
  });

  it('keeps the old chunks when cancelled mid-way', async () => {
    await seedSource('s1');
    const controller = new AbortController();
    let release!: () => void;
    embedGate = new Promise<void>((resolve) => { release = resolve; });
    const job = useAIStore.getState().reindexKnowledgeSource('s1', pagedText(), { signal: controller.signal });
    const settled = job.catch((error: Error) => error);
    controller.abort();
    release();
    expect(((await settled) as Error).name).toBe('ReindexCancelledError');
    expect((await getVaultChunksBySource('s1')).map((chunk) => chunk.id)).toEqual(['old1', 'old2', 'old3']);
  });

  it('does not write when the profile changes during indexing', async () => {
    await seedSource('s1');
    let release!: () => void;
    embedGate = new Promise<void>((resolve) => { release = resolve; });
    const job = useAIStore.getState().reindexKnowledgeSource('s1', pagedText());
    const settled = job.catch((error: Error) => error);
    bumpProfileEpoch();
    release();
    expect(((await settled) as Error).name).toBe('ProfileChangedError');
    expect((await getVaultChunksBySource('s1')).map((chunk) => chunk.id)).toEqual(['old1', 'old2', 'old3']);
  });

  it('refuses a file that looks like a different, much smaller document', async () => {
    await seedSource('s1');
    useAIStore.setState((state) => ({ knowledgeSources: state.knowledgeSources.map((s) => ({ ...s, chunkCount: 500 })) }));
    await expect(useAIStore.getState().reindexKnowledgeSource('s1', pagedText())).rejects.toThrow(/alt document/);
    expect((await getVaultChunksBySource('s1')).map((chunk) => chunk.id)).toEqual(['old1', 'old2', 'old3']);
  });

  it('rejects unknown and non-PDF sources, and a source deleted meanwhile', async () => {
    await expect(useAIStore.getState().reindexKnowledgeSource('nope', 'x')).rejects.toThrow(/nu mai există/);
    await seedSource('s2', 'docx');
    await expect(useAIStore.getState().reindexKnowledgeSource('s2', 'x')).rejects.toThrow(/PDF/);
  });
});
