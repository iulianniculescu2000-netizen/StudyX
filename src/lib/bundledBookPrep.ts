/**
 * Pregătirea automată a cărților de bază (Kumar, Lawrence, Sinopsis).
 *
 * Cărțile vin cu installerul (text curat în `bookText`), deci orice utilizator le are fără să le adauge: la pornirea
 * profilului, în fundal, se indexează dacă lipsesc, au eșuat, au rămas întrerupte sau sunt vechi (textul curat s-a schimbat).
 *
 * DECIZIA DE COST (embeddings): ~4000 de pagini înseamnă mii de fragmente; prin API-ul Gemini ar fi zeci de cereri
 * plătite/limitate și ar depinde de o cheie. Cărțile de bază se indexează deci cu embeddings LOCALE (hash, offline,
 * `embedTextLocal`), fără nicio cerere de rețea și fără legătură cu existența unei chei AI. Căutarea se bazează oricum
 * pe BM25 + reranking; un fragment cu vector local (256) față de o interogare cu vector API (768) primește automat
 * întreaga pondere lexicală (`dimMismatch` în `retriever.ts`). Dacă vreodată se dorește semantic API pentru cărți,
 * se poate face o trecere separată, explicit cerută de utilizator.
 *
 * Proprietăți: idempotent (o singură rulare la un moment dat, nu creează dubluri), o carte pe rând, reia după
 * întrerupere (`reconcileInterruptedIndexing` transformă `indexing` rămas în gata/eroare), reîncercare limitată,
 * se oprește curat dacă se schimbă profilul (noul profil își programează propria rulare).
 */
import { create } from 'zustand';
import { useAIStore, isSourceReady } from '../store/aiStore';
import { currentProfileEpoch, ProfileChangedError } from '../store/profileEpoch';
import { getIndexedChunkCounts, getIndexedSources, removeChunksBySource } from '../ai/vectorStore';
import { scheduleIdleTask } from './idleTaskScheduler';
import { REZIDENTIAT_LIBRARY_BOOKS, type RezidentiatLibraryBook } from './rezidentiatLibrary';
import { findOrCreateRezidentiatLibraryRoot } from './rezidentiatRoot';

export type BundledPrepPhase = 'idle' | 'running' | 'done';

interface BundledPrepState {
  phase: BundledPrepPhase;
  /** Cartea la care se lucrează acum (progresul ei e `indexProgress` în sursa din store). */
  currentBookId: string | null;
  /** Cărțile care au rămas cu eroare după reîncercări în această sesiune. */
  failedBookIds: string[];
}

export const useBundledPrepStore = create<BundledPrepState>(() => ({ phase: 'idle', currentBookId: null, failedBookIds: [] }));

export const MAX_ATTEMPTS_PER_BOOK = 3;
const RETRY_DELAY_MS = 4000;

export interface PrepareOptions {
  /** Pauza între reîncercări; testele o fac 0. */
  retryDelayMs?: number;
  /** Cărțile de pregătit (testele pot pune încărcători falși). */
  books?: ReadonlyArray<RezidentiatLibraryBook>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

type BookOutcome = 'ok' | 'busy' | 'failed';

async function prepareOneBook(book: RezidentiatLibraryBook, guard: () => void, retryDelayMs: number): Promise<BookOutcome> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_BOOK; attempt += 1) {
    try {
      guard();
      const store = useAIStore.getState();
      const same = store.knowledgeSources.filter((source) => source.name === book.name);
      // Se indexează deja (adăugare manuală pornită acum): nu pornim o a doua.
      if (same.some((source) => source.indexStatus === 'indexing')) return 'busy';

      const ready = same.find((source) => isSourceReady(source));
      if (ready) {
        const counts = await getIndexedChunkCounts();
        guard();
        const text = await book.load();
        guard();
        const stale = text.length !== ready.charCount || (counts[ready.id] ?? 0) === 0;
        if (stale) {
          await store.reindexKnowledgeSource(ready.id, text, { localEmbeddings: true });
          guard();
        }
        const rootId = findOrCreateRezidentiatLibraryRoot();
        if (useAIStore.getState().knowledgeSources.find((source) => source.id === ready.id)?.folderId !== rootId) {
          useAIStore.getState().moveSourceToLibraryFolder(ready.id, rootId);
        }
        return 'ok';
      }

      // O copie eșuată se înlocuiește (nu rămâne o dublură cu eroare).
      for (const failed of same.filter((source) => source.indexStatus === 'error')) await store.removeKnowledgeSource(failed.id);
      guard();
      const text = await book.load();
      guard();
      const rootId = findOrCreateRezidentiatLibraryRoot();
      await useAIStore.getState().addKnowledgeSource(book.name, text, 'pdf', { folderId: rootId, localEmbeddings: true });
      return 'ok';
    } catch (error) {
      if (error instanceof ProfileChangedError) throw error;
      lastError = error;
      guard();
      if (attempt < MAX_ATTEMPTS_PER_BOOK) await sleep(retryDelayMs * attempt);
    }
  }
  console.warn(`Cartea „${book.label}” nu s-a putut pregăti:`, lastError);
  return 'failed';
}

/**
 * Șterge din indexul vectorial copiile unei cărți de bază care nu mai au sursă în bibliotecă.
 * Apar când fragmentele s-au scris, dar lista surselor nu s-a mai salvat (aplicația oprită brusc în cele câteva
 * secunde dintre cele două scrieri, sau un store golit de HMR în dezvoltare) și cartea s-a adăugat apoi din nou.
 * Prudent: doar numele cărților de bază și doar când biblioteca are deja o copie gata, cu fragmente, a aceleiași cărți,
 * deci nu se atinge niciodată singura copie și nici materialele utilizatorului (acestea nu se pot regenera).
 */
async function removeOrphanedBookCopies(books: ReadonlyArray<RezidentiatLibraryBook>, guard: () => void): Promise<void> {
  const indexed = await getIndexedSources();
  guard();
  const { knowledgeSources } = useAIStore.getState();
  const known = new Set(knowledgeSources.map((source) => source.id));
  const countById = new Map(indexed.map((entry) => [entry.sourceId, entry.count]));
  for (const entry of indexed) {
    if (known.has(entry.sourceId) || !books.some((book) => book.name === entry.source)) continue;
    const keeper = knowledgeSources.find((source) => source.name === entry.source && source.indexStatus === 'ready' && (countById.get(source.id) ?? 0) > 0);
    if (!keeper) continue;
    guard();
    await removeChunksBySource(entry.sourceId);
  }
}

let inFlight: Promise<void> | null = null;
let rerunRequested = false;

/**
 * Pregătește cărțile de bază care lipsesc sau sunt vechi. Apelurile suprapuse se unesc într-o singură rulare
 * (plus una de verificare la final dacă s-a cerut între timp, de ex. profil schimbat).
 */
export function ensureBundledBooks(options: PrepareOptions = {}): Promise<void> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  const books = options.books ?? REZIDENTIAT_LIBRARY_BOOKS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const run = async () => {
    do {
      rerunRequested = false;
      const startedInEpoch = currentProfileEpoch();
      const guard = () => { if (currentProfileEpoch() !== startedInEpoch) throw new ProfileChangedError(); };
      useBundledPrepStore.setState({ phase: 'running', currentBookId: null, failedBookIds: [] });
      try {
        await useAIStore.getState().reconcileInterruptedIndexing();
        guard();
        const failedIds: string[] = [];
        for (const book of books) {
          guard();
          useBundledPrepStore.setState({ currentBookId: book.id });
          const outcome = await prepareOneBook(book, guard, retryDelayMs);
          if (outcome === 'failed') failedIds.push(book.id);
          useBundledPrepStore.setState({ failedBookIds: [...failedIds] });
        }
        guard();
        await removeOrphanedBookCopies(books, guard);
      } catch (error) {
        // Profil schimbat: noul profil își programează singur o rulare.
        if (!(error instanceof ProfileChangedError)) console.warn('Pregătirea cărților de bază a eșuat.', error);
        rerunRequested = rerunRequested && error instanceof ProfileChangedError;
      }
    } while (rerunRequested);
    useBundledPrepStore.setState({ phase: 'done', currentBookId: null });
  };
  inFlight = run().finally(() => { inFlight = null; });
  return inFlight;
}

/** Programează pregătirea în timpul liber al ferestrei (nu blochează randarea). Apelat după hidratarea unui profil. */
export function scheduleBundledBookPreparation(): void {
  scheduleIdleTask(() => { void ensureBundledBooks(); }, { timeoutMs: 4000, dedupeKey: 'bundled-books-prep' });
}

/** Doar pentru teste. */
export function resetBundledPrepForTests(): void {
  inFlight = null;
  rerunRequested = false;
  useBundledPrepStore.setState({ phase: 'idle', currentBookId: null, failedBookIds: [] });
}
