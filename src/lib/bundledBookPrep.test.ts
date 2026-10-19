import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('./idb', () => ({
  idbGet: async (key: string) => db.get(key),
  idbSet: async (key: string, value: unknown) => { db.set(key, value); },
  idbRemove: async (key: string) => { db.delete(key); },
}));

// Orice apel de rețea (embeddings API) ar însemna cost: cărțile de bază nu trebuie să-l folosească niciodată.
const networkEmbeds = vi.fn();
vi.mock('../ai/embeddings', () => ({
  embedBatch: async (texts: string[]) => { networkEmbeds(texts.length); return texts.map(() => [0, 1]); },
  embedText: async () => [0, 1],
  embedTextLocal: () => [1, 0, 0],
  cosineSimilarity: () => 0,
}));

import { useAIStore } from '../store/aiStore';
import { bumpProfileEpoch } from '../store/profileEpoch';
import { extractPageMap, pageMarker, rememberPageMap } from '../ai/pageMarkers';
import { addChunksToVault, getIndexedChunkCounts, getVaultChunksBySource, setVectorStoreProfile } from '../ai/vectorStore';
import { ensureBundledBooks, resetBundledPrepForTests, useBundledPrepStore, MAX_ATTEMPTS_PER_BOOK } from './bundledBookPrep';
import { REZIDENTIAT_LIBRARY_BOOKS, type RezidentiatLibraryBook } from './rezidentiatLibrary';
import { bundledBookStatuses } from './bundledBooks';

const para = (n: number) => `Capitolul ${n} discută hipertensiunea arterială și complicațiile ei cardiovasculare, tratamentul și monitorizarea pacientului. `.repeat(8);

function pagedText(pages = 8): string {
  const raw = Array.from({ length: pages }, (_, i) => pageMarker(i + 1, i + 1) + para(i + 1)).join('\n');
  const { text: untrimmed, pages: map } = extractPageMap(raw);
  const text = untrimmed.trim();
  rememberPageMap(text, map);
  return text;
}

let loads: Record<string, () => Promise<string>>;
function fakeBooks(): RezidentiatLibraryBook[] {
  return REZIDENTIAT_LIBRARY_BOOKS.map((book) => ({ ...book, load: () => loads[book.id]() }));
}
const run = () => ensureBundledBooks({ books: fakeBooks(), retryDelayMs: 0 });
const sourcesOf = (name: string) => useAIStore.getState().knowledgeSources.filter((s) => s.name === name);

function pendingSource(id: string, name: string, indexStatus: 'indexing' | 'error') {
  return { id, name, type: 'pdf' as const, preview: '', charCount: 1, wordCount: 1, chunkCount: 0, qualityScore: 1, addedAt: 1, indexStatus, indexProgress: indexStatus === 'indexing' ? 40 : 0 };
}

beforeEach(async () => {
  vi.useRealTimers();
  db.clear();
  networkEmbeds.mockClear();
  resetBundledPrepForTests();
  // Ca în aplicație, fiecare încărcare reînregistrează harta paginilor a textului întors.
  loads = Object.fromEntries(REZIDENTIAT_LIBRARY_BOOKS.map((book, i) => [book.id, async () => pagedText(8 + i)]));
  await setVectorStoreProfile('p1');
  useAIStore.setState({ knowledgeSources: [], libraryFolders: [] });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('pregătirea automată a cărților de bază', () => {
  it('indexează cele trei cărți în folderul Rezidențiat, fără niciun apel de rețea', async () => {
    await run();
    const { knowledgeSources, libraryFolders } = useAIStore.getState();
    expect(knowledgeSources).toHaveLength(3);
    const roots = libraryFolders.filter((f) => f.name === 'Rezidențiat');
    expect(roots).toHaveLength(1);
    expect(knowledgeSources.every((s) => s.indexStatus === 'ready' && s.folderId === roots[0].id)).toBe(true);
    expect(bundledBookStatuses(knowledgeSources).map((s) => s.state)).toEqual(['ready', 'ready', 'ready']);
    expect(networkEmbeds).not.toHaveBeenCalled();
    expect((await getVaultChunksBySource(knowledgeSources[0].id))[0].embedding).toEqual([1, 0, 0]);
    expect(useBundledPrepStore.getState().phase).toBe('done');
  });

  it('este idempotentă: pornire dublă simultană și rulări repetate nu fac dubluri', async () => {
    await Promise.all([run(), run(), run()]);
    await run();
    expect(useAIStore.getState().knowledgeSources).toHaveLength(3);
    expect(useAIStore.getState().libraryFolders.filter((f) => f.name === 'Rezidențiat')).toHaveLength(1);
  });

  it('o singură carte pe rând', async () => {
    const seen: string[] = [];
    const unsubscribe = useBundledPrepStore.subscribe((state) => { if (state.currentBookId && seen.at(-1) !== state.currentBookId) seen.push(state.currentBookId); });
    let concurrent = 0;
    let maxConcurrent = 0;
    for (const book of REZIDENTIAT_LIBRARY_BOOKS) {
      const original = loads[book.id];
      loads[book.id] = async () => { concurrent += 1; maxConcurrent = Math.max(maxConcurrent, concurrent); const text = await original(); concurrent -= 1; return text; };
    }
    await run();
    unsubscribe();
    expect(seen).toEqual(REZIDENTIAT_LIBRARY_BOOKS.map((b) => b.id));
    expect(maxConcurrent).toBe(1);
  });

  it('înlocuiește o copie eșuată în loc să lase o dublură', async () => {
    const kumar = REZIDENTIAT_LIBRARY_BOOKS[0];
    useAIStore.setState({ knowledgeSources: [pendingSource('bad', kumar.name, 'error')] });
    await run();
    const copies = sourcesOf(kumar.name);
    expect(copies).toHaveLength(1);
    expect(copies[0].id).not.toBe('bad');
    expect(copies[0].indexStatus).toBe('ready');
  });

  it('reia o indexare întreruptă (stare „indexing” rămasă după restart)', async () => {
    const lawrence = REZIDENTIAT_LIBRARY_BOOKS[1];
    useAIStore.setState({ knowledgeSources: [pendingSource('half', lawrence.name, 'indexing')] });
    await run();
    const copies = sourcesOf(lawrence.name);
    expect(copies).toHaveLength(1);
    expect(copies[0].indexStatus).toBe('ready');
  });

  it('reindexează o carte veche (text curat schimbat) pe loc, păstrând id-ul și folderul', async () => {
    await run();
    const kumar = REZIDENTIAT_LIBRARY_BOOKS[0];
    const before = sourcesOf(kumar.name)[0];
    loads[kumar.id] = async () => pagedText(12);
    await run();
    const after = sourcesOf(kumar.name);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].folderId).toBe(before.folderId);
    expect(after[0].charCount).not.toBe(before.charCount);
    expect(networkEmbeds).not.toHaveBeenCalled();
  });

  it('o carte „gata” al cărei index a dispărut se reface', async () => {
    await run();
    const kumar = REZIDENTIAT_LIBRARY_BOOKS[0];
    const id = sourcesOf(kumar.name)[0].id;
    db.clear();
    await setVectorStoreProfile('p1');
    expect(await getVaultChunksBySource(id)).toHaveLength(0);
    await run();
    expect((await getVaultChunksBySource(id)).length).toBeGreaterThan(0);
    expect(sourcesOf(kumar.name)).toHaveLength(1);
  });

  it('nu lasă în index o copie orfană când lista surselor salvată nu a prins o adăugare', async () => {
    // Pornire normală: lista surselor se salvează (ca în fișierul profilului).
    await run();
    const kumar = REZIDENTIAT_LIBRARY_BOOKS[0];
    const saved = useAIStore.getState().knowledgeSources;
    const keeperId = sourcesOf(kumar.name)[0].id;
    // Store-ul pierde Kumar (HMR în dezvoltare / oprire bruscă înainte de salvare) și cartea se adaugă din nou:
    // fragmentele noii copii ajung în index, dar lista ei nu se mai salvează.
    useAIStore.setState({ knowledgeSources: saved.filter((s) => s.id !== keeperId) });
    await run();
    const orphanId = sourcesOf(kumar.name)[0].id;
    expect(orphanId).not.toBe(keeperId);
    // Repornire: se încarcă lista salvată, care are doar copia veche.
    useAIStore.setState({ knowledgeSources: saved });
    await setVectorStoreProfile('p1');
    expect(Object.keys(await getIndexedChunkCounts())).toContain(orphanId);
    await run();
    const counts = await getIndexedChunkCounts();
    expect(Object.keys(counts)).not.toContain(orphanId);
    expect(counts[keeperId]).toBeGreaterThan(0);
    expect(Object.keys(counts).sort()).toEqual(saved.map((s) => s.id).sort());
  });

  it('nu atinge fragmentele fără sursă ale materialelor proprii și nici singura copie a unei cărți', async () => {
    await run();
    const kumar = REZIDENTIAT_LIBRARY_BOOKS[0];
    const keeperId = sourcesOf(kumar.name)[0].id;
    await addChunksToVault([{ id: 'm1', text: 'Notițele mele despre insuficiența cardiacă.' }], 'Notițe.pdf', 'mine', { localEmbeddings: true });
    // Lista nu mai are nicio carte (și nu se pot reîncărca): fragmentele cărții sunt singura copie, deci rămân.
    useAIStore.setState({ knowledgeSources: [] });
    loads = Object.fromEntries(REZIDENTIAT_LIBRARY_BOOKS.map((book) => [book.id, async () => { throw new Error('fără text'); }]));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await run();
    const counts = await getIndexedChunkCounts();
    expect(counts.mine).toBe(1);
    expect(counts[keeperId]).toBeGreaterThan(0);
  });

  it('reîncearcă limitat la eroare și apoi trece mai departe', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lawrence = REZIDENTIAT_LIBRARY_BOOKS[1];
    let calls = 0;
    loads[lawrence.id] = async () => { calls += 1; throw new Error('fără text'); };
    await run();
    expect(calls).toBe(MAX_ATTEMPTS_PER_BOOK);
    expect(useBundledPrepStore.getState().failedBookIds).toEqual([lawrence.id]);
    expect(sourcesOf(lawrence.name)).toHaveLength(0);
    expect(useAIStore.getState().knowledgeSources).toHaveLength(2);
  });

  it('reușește la a doua încercare după o eroare trecătoare', async () => {
    const sinopsis = REZIDENTIAT_LIBRARY_BOOKS[2];
    const original = loads[sinopsis.id];
    let first = true;
    loads[sinopsis.id] = async () => { if (first) { first = false; throw new Error('trecător'); } return original(); };
    await run();
    expect(sourcesOf(sinopsis.name)).toHaveLength(1);
    expect(sourcesOf(sinopsis.name)[0].indexStatus).toBe('ready');
    expect(useBundledPrepStore.getState().failedBookIds).toEqual([]);
  });

  it('se oprește curat dacă profilul se schimbă în timpul indexării', async () => {
    const kumar = REZIDENTIAT_LIBRARY_BOOKS[0];
    const original = loads[kumar.id];
    loads[kumar.id] = async () => { bumpProfileEpoch(); return original(); };
    await run();
    expect(sourcesOf(kumar.name)).toHaveLength(0);
    expect(useBundledPrepStore.getState().phase).toBe('done');
  });
});
