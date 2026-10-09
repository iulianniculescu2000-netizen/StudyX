/**
 * Per-profile data persistence.
 * Prioritizes Disk Storage (Electron) to bypass LocalStorage 5MB limit.
 */

import { useQuizStore } from './quizStore';
import { useFolderStore } from './folderStore';
import { useStatsStore } from './statsStore';
import { useNotesStore } from './notesStore';
import { useAIStore, type AIKnowledgeSource, type AILibraryFolder } from './aiStore';
import { inheritLegacyVectorsIfOwner, setVectorStoreProfile } from '../ai/vectorStore';
import type { Quiz, QuizSession, Folder, QuestionStat, StudyStreak } from '../types';
import { useSaveStatusStore } from './saveStatusStore';
import { useToastStore } from './toastStore';
import { bumpProfileEpoch } from './profileEpoch';
import { retireSplitSourceStats } from '../lib/retireSplitStats';

const LS_KEY = (profileId: string, ns: string) => `studyx-p-${profileId}-${ns}`;
type ProfileNamespace = 'quizzes' | 'folders' | 'stats' | 'notes' | 'ai';
const CORRUPT_TOAST_ID = 'profile-storage-corrupt';
const QUOTA_TOAST_ID = 'profile-storage-quota';
const QUARANTINE_SUFFIX = '__corrupt-';
/** How many quarantined copies to keep per namespace before pruning the oldest. */
const QUARANTINE_KEEP = 3;
type LoadMarker<T> = T & { __corrupt?: boolean; __namespace?: string };

export type ProfileStorageErrorKind = 'quota' | 'unknown' | 'load-failed';

/**
 * Thrown when a save did not reach storage. This exists so a failed write can
 * never be mistaken for a successful one: callers that import data need to know
 * the work is still only in memory.
 */
export class ProfileStorageError extends Error {
  readonly kind: ProfileStorageErrorKind;
  readonly namespace: string;

  constructor(kind: ProfileStorageErrorKind, namespace: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProfileStorageError';
    this.kind = kind;
    this.namespace = namespace;
  }
}

export function isProfileStorageError(value: unknown): value is ProfileStorageError {
  return value instanceof ProfileStorageError;
}

function classifyWriteError(err: unknown): ProfileStorageErrorKind {
  const name = (err as { name?: string } | null)?.name ?? '';
  const message = String((err as { message?: string } | null)?.message ?? '');
  // Browsers disagree on the name; Firefox uses NS_ERROR_DOM_QUOTA_REACHED.
  if (/quota/i.test(name) || /quota/i.test(message) || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'quota';
  }
  return 'unknown';
}

/** Every quarantined blob currently held for a profile, newest first. */
export function listQuarantinedKeys(profileId: string): string[] {
  const prefix = `studyx-p-${profileId}-`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix) && key.includes(QUARANTINE_SUFFIX)) keys.push(key);
  }
  return keys.sort().reverse();
}

/**
 * Copies a blob we could not read to a timestamped backup key.
 *
 * The original is deliberately left in place: if this copy fails (we may be out
 * of space, which is how the app got into trouble in the first place), the only
 * remaining copy must not be one we just deleted. Autosave may later overwrite
 * the original, and that is exactly what the backup is here to survive.
 */
function quarantine(profileId: string, ns: string, raw: string): boolean {
  let saved = true;
  try {
    localStorage.setItem(`${LS_KEY(profileId, ns)}${QUARANTINE_SUFFIX}${Date.now()}`, raw);
    const mine = listQuarantinedKeys(profileId).filter((key) => key.startsWith(`${LS_KEY(profileId, ns)}${QUARANTINE_SUFFIX}`));
    mine.slice(QUARANTINE_KEEP).forEach((key) => localStorage.removeItem(key));
  } catch {
    // Out of space — the untouched original is still the best copy we have.
    saved = false;
  }
  if (saved) {
    useToastStore.getState().upsertToast(
      CORRUPT_TOAST_ID,
      `Datele „${ns}" nu au putut fi citite. Am pastrat o copie de siguranta si am pornit de la zero pentru aceasta sectiune.`,
      'warning',
      9000,
    );
  }
  return saved;
}

/**
 * A read that could not be completed (IPC error/timeout, or an unreadable blob we could not back up).
 * Distinct from "there is no data yet": the profile must NOT be treated as empty, and nothing may be
 * written over what is on disk.
 */
export class ProfileLoadFailure extends Error {
  readonly namespace: string;
  constructor(namespace: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProfileLoadFailure';
    this.namespace = namespace;
  }
}

/** Backoff between disk read attempts (ms) and the per-attempt timeout. Mutable so tests can shrink them. */
export const loadRetryConfig = { delays: [250, 800] as number[], timeoutMs: 20_000 };

function sleep(ms: number) {
  return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
}

async function loadFromDisk(profileId: string, ns: string): Promise<unknown> {
  const attempts = loadRetryConfig.delays.length + 1;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('storageLoad timeout')), loadRetryConfig.timeoutMs);
      });
      return await Promise.race([window.electronAPI!.storageLoad!(profileId, ns), timeout]);
    } catch (err) {
      lastErr = err;
      if (i < loadRetryConfig.delays.length) await sleep(loadRetryConfig.delays[i]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw new ProfileLoadFailure(ns, `Citirea "${ns}" de pe disc a esuat.`, { cause: lastErr });
}

/** `${profileId}:${ns}` of namespaces whose load failed: autosave must not touch them. */
const blockedNamespaces = new Set<string>();
const LOAD_FAILED_TOAST_ID = 'profile-load-failed';

export function isNamespaceBlocked(profileId: string, ns: string): boolean {
  return blockedNamespaces.has(`${profileId}:${ns}`);
}

// Mutex lock to prevent overlapping disk writes
let writeLock: Promise<void> = Promise.resolve();
const lastSerializedSnapshot = new Map<string, string>();
/**
 * References of the snapshot values (quizzes array, sessions array, ...) at the moment they were last
 * confirmed saved/loaded. The stores are immutable, so identical references mean identical content and
 * we can skip JSON.stringify of a multi-MB blob entirely (it cost 100-400 ms per save and ~100 ms at hydrate).
 */
const lastSavedRefs = new Map<string, unknown[]>();

function snapshotRefs(data: unknown): unknown[] | null {
  return data && typeof data === 'object' ? Object.values(data as Record<string, unknown>) : null;
}

function sameRefs(a: unknown[] | undefined, b: unknown[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
/**
 * The profile whose data is currently loaded into the stores. Nothing may be
 * persisted for any other profile id: while a profile is still loading (or the
 * previous one is being torn down) the stores hold empty or foreign data, and
 * writing them would replace the real copy with it.
 */
let hydratedProfileId: string | null = null;
/** Namespaces loaded from a localStorage copy that is newer than disk — the next save must push them to disk. */
const localOnly = new Set<string>();

function snapshotFor(namespace: ProfileNamespace) {
  switch (namespace) {
    case 'quizzes':
      return useQuizStore.getState()._snapshot();
    case 'folders':
      return useFolderStore.getState()._snapshot();
    case 'stats':
      return useStatsStore.getState()._snapshot();
    case 'notes':
      return useNotesStore.getState()._snapshot();
    case 'ai':
      return useAIStore.getState()._snapshot();
  }
}

export function isQuizSnapshot(value: unknown): value is { quizzes: Quiz[]; sessions: QuizSession[] } {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.quizzes) && Array.isArray(data.sessions);
}

export function isFolderSnapshot(value: unknown): value is { folders: Folder[] } {
  if (!value || typeof value !== 'object') return false;
  return Array.isArray((value as Record<string, unknown>).folders);
}

export function isStatsSnapshot(value: unknown): value is { questionStats: Record<string, QuestionStat>; streak: StudyStreak; totalStudyTime: number } {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  const streak = data.streak as Record<string, unknown> | undefined;
  return !!streak
    && typeof data.questionStats === 'object'
    && typeof data.totalStudyTime === 'number'
    && typeof streak.currentStreak === 'number'
    && typeof streak.longestStreak === 'number'
    && typeof streak.lastStudyDate === 'string'
    && Array.isArray(streak.studyDates);
}

export function isNotesSnapshot(value: unknown): value is { notes: Record<string, string> } {
  if (!value || typeof value !== 'object') return false;
  const notes = (value as Record<string, unknown>).notes;
  return !!notes && typeof notes === 'object' && !Array.isArray(notes);
}

export function isAiSnapshot(value: unknown): value is { knowledgeSources: AIKnowledgeSource[]; libraryFolders: AILibraryFolder[] } {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.knowledgeSources) && Array.isArray(data.libraryFolders);
}

function validateSnapshot<T>(namespace: ProfileNamespace, data: unknown): T | null {
  switch (namespace) {
    case 'quizzes':
      return (isQuizSnapshot(data) ? data : null) as T | null;
    case 'folders':
      return (isFolderSnapshot(data) ? data : null) as T | null;
    case 'stats':
      return (isStatsSnapshot(data) ? data : null) as T | null;
    case 'notes':
      return (isNotesSnapshot(data) ? data : null) as T | null;
    case 'ai':
      return (isAiSnapshot(data) ? data : null) as T | null;
  }
}

async function read<T>(profileId: string, ns: string, legacyKey?: string): Promise<T | null> {
  try {
    // 1. A localStorage copy exists only when it is newer than disk: write() deletes it after
    //    every successful disk write, and flushProfileDataSync() creates it on the way out.
    //    (Reading disk first used to resurrect the older snapshot after a minimize/close.)
    const localRaw = localStorage.getItem(LS_KEY(profileId, ns));
    if (localRaw) {
      let parsedLocal: unknown;
      try {
        parsedLocal = JSON.parse(localRaw);
      } catch {
        parsedLocal = undefined; // unreadable: handled by the fallback below, which quarantines it
      }
      if (parsedLocal !== undefined) {
        const validatedLocal = validateSnapshot<T>(ns as ProfileNamespace, parsedLocal);
        if (validatedLocal) {
          if (window.electronAPI?.storageSave) localOnly.add(`${profileId}:${ns}`);
          return validatedLocal;
        }
      }
    }

    // 2. Disk Storage (Electron only)
    if (window.electronAPI?.storageLoad) {
      const diskData = await loadFromDisk(profileId, ns) as LoadMarker<unknown> | null;
      if (diskData?.__corrupt) {
        // Deliberately NOT returning here: the localStorage copy below is often
        // intact, and bailing out early turned a recoverable disk problem into
        // an empty profile.
        useSaveStatusStore.getState().setRecovering('Recuperăm datele profilului');
        useToastStore.getState().upsertToast(CORRUPT_TOAST_ID, `Am detectat un fișier corupt în ${diskData.__namespace ?? ns}. Încerc copia locală.`, 'warning', 5200);
      } else if (diskData) {
        const validated = validateSnapshot<T>(ns as ProfileNamespace, diskData);
        if (validated) return validated;
      }
    }

    // 3. Fallback to LocalStorage (an unreadable or off-shape copy ends up quarantined here)
    const raw = localStorage.getItem(LS_KEY(profileId, ns));
    if (raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Unreadable, but not worthless — keep the bytes for recovery.
        // If the backup fails, the original is the only copy: refuse to continue as "empty" (autosave would overwrite it).
        if (!quarantine(profileId, ns, raw)) throw new ProfileLoadFailure(ns, `Nu am putut face copie de siguranta pentru "${ns}".`);
        parsed = undefined;
      }
      if (parsed !== undefined) {
        const validated = validateSnapshot<T>(ns as ProfileNamespace, parsed);
        if (validated) return validated;
        // Parsed fine but doesn't match the expected shape (e.g. a schema
        // change). Previously this was deleted outright.
        if (!quarantine(profileId, ns, raw)) throw new ProfileLoadFailure(ns, `Nu am putut face copie de siguranta pentru "${ns}".`);
      }
    }

    // 4. Legacy Migration
    if (legacyKey) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) {
        let parsed: { state?: unknown } | null | undefined;
        try {
          parsed = JSON.parse(legacyRaw);
        } catch {
          // Legacy blob unreadable: keep the bytes (key untouched) and carry on with no legacy data.
          if (!quarantine(profileId, `legacy-${legacyKey}`, legacyRaw)) {
            throw new ProfileLoadFailure(ns, `Nu am putut face copie de siguranta pentru "${legacyKey}".`);
          }
          return null;
        }
        const data = parsed?.state ?? parsed;
        const validated = validateSnapshot<T>(ns as ProfileNamespace, data);
        if (validated) {
          await write(profileId, ns, validated, { force: true }); // still loading, so not "hydrated" yet
          localStorage.removeItem(legacyKey);
          return validated;
        }
      }
    }
    return null;
  } catch (err) {
    // Do NOT swallow: "could not read" must never look like "nothing there".
    if (err instanceof ProfileLoadFailure) throw err;
    throw new ProfileLoadFailure(ns, `Citirea "${ns}" a esuat.`, { cause: err });
  }
}

async function write(profileId: string, ns: string, data: unknown, options: { force?: boolean } = {}) {
  if (!options.force && hydratedProfileId !== profileId) return;
  if (blockedNamespaces.has(`${profileId}:${ns}`)) {
    throw new ProfileStorageError('load-failed', ns, `"${ns}" nu s-a incarcat; salvarea e blocata pana la o incarcare reusita.`);
  }
  const cacheKey = `${profileId}:${ns}`;
  const refs = snapshotRefs(data);
  if (sameRefs(lastSavedRefs.get(cacheKey), refs)) return;
  const serialized = JSON.stringify(data);
  if (lastSerializedSnapshot.get(cacheKey) === serialized) {
    if (refs) lastSavedRefs.set(cacheKey, refs);
    return;
  }
  useSaveStatusStore.getState().setSaving();

  const previousLock = writeLock;
  let resolveLock!: () => void;
  writeLock = new Promise<void>((resolve) => { resolveLock = resolve; });

  try {
    await previousLock;
    // 1. Try Disk Storage (Premium Path)
    if (window.electronAPI?.storageSave) {
      const success = await window.electronAPI.storageSave(profileId, ns, serialized);
      if (success) {
        lastSerializedSnapshot.set(cacheKey, serialized);
        if (refs) lastSavedRefs.set(cacheKey, refs);
        // Clear LS to save space if disk save worked
        localStorage.removeItem(LS_KEY(profileId, ns));
        useSaveStatusStore.getState().setSaved();
        return;
      }
    }

    // 2. Fallback to LocalStorage (Browser or error)
    localStorage.setItem(LS_KEY(profileId, ns), serialized);
    lastSerializedSnapshot.set(cacheKey, serialized);
    if (refs) lastSavedRefs.set(cacheKey, refs);
    useSaveStatusStore.getState().setSaved('Salvat local');
  } catch (err) {
    console.error('[Storage] Write failed:', err);
    const kind = classifyWriteError(err);
    useSaveStatusStore.getState().setError(
      kind === 'quota' ? 'Spațiu insuficient — NU s-a salvat' : 'Eroare la salvare',
    );
    // The save-status pill clears itself after ~3s, which is far too quiet for
    // "your work is not on disk". Losing data deserves a toast that stays put.
    useToastStore.getState().upsertToast(
      QUOTA_TOAST_ID,
      kind === 'quota'
        ? 'Spațiul de stocare al browserului este plin. Modificările NU au fost salvate — eliberează spațiu sau folosește aplicația de desktop.'
        : 'Salvarea a eșuat. Modificările sunt doar în memorie — nu închide aplicația până nu reușești să salvezi.',
      'error',
      30_000,
    );
    // Rethrow so importers and profile swaps can no longer mistake a failed
    // write for a successful one.
    throw new ProfileStorageError(kind, ns, `Nu am putut salva "${ns}".`, { cause: err });
  } finally {
    resolveLock();
  }
}

export async function saveProfileNamespace(profileId: string, namespace: ProfileNamespace) {
  await write(profileId, namespace, snapshotFor(namespace));
}

/**
 * Synchronous, best-effort flush of every namespace straight to localStorage.
 *
 * The normal path (`write()`) always crosses at least one microtask boundary
 * (`await previousLock` yields even when the lock is already resolved), and on
 * top of that autosave itself waits 2.8s debounce + up to 2.4s of idle-task
 * deferral before it even attempts a write (`useProfileLifecycle.ts`) — a
 * multi-second window where a recent change (e.g. a quiz the AI agent just
 * created) exists only in memory. `pagehide`/`visibilitychange` handlers fire
 * on reload/close, but the browser does not wait for async work started in
 * them to finish, so the async flush they trigger is not a reliable safety
 * net on its own. This bypasses the lock, the Electron disk-save round trip,
 * and the unchanged-snapshot dedupe check — call it first, synchronously,
 * before doing anything else in an unload handler; the (still-async)
 * `saveProfileData` can run after for its normal error toasts / disk save,
 * since the matching cached snapshot makes it a no-op if this already wrote
 * the same data.
 */
export function flushProfileDataSync(profileId: string) {
  // While this profile is still loading (or after it was swapped out) the stores do not hold its data.
  if (hydratedProfileId !== profileId) return;
  const namespaces: ProfileNamespace[] = ['quizzes', 'folders', 'stats', 'notes', 'ai'];
  for (const ns of namespaces) {
    if (isNamespaceBlocked(profileId, ns)) continue; // a localStorage copy would later beat the real disk data
    try {
      const snapshot = snapshotFor(ns);
      const cacheKey = `${profileId}:${ns}`;
      if (sameRefs(lastSavedRefs.get(cacheKey), snapshotRefs(snapshot))) continue;
      const serialized = JSON.stringify(snapshot);
      if (lastSerializedSnapshot.get(cacheKey) === serialized) continue;
      // The cache means "already written by write()". Not updating it here keeps the async save that
      // follows from skipping the disk write because the localStorage copy happens to match.
      localStorage.setItem(LS_KEY(profileId, ns), serialized);
    } catch (err) {
      // Best-effort on the way out — nothing more we can do synchronously;
      // the async path still surfaces quota/write errors during normal use.
      console.error(`[Storage] Sync flush failed for "${ns}":`, err);
    }
  }
}

/** Save all current store state for a profile */
export async function saveProfileData(profileId: string) {
  const all: ProfileNamespace[] = ['quizzes', 'folders', 'stats', 'notes', 'ai'];
  // Blocked (failed-to-load) namespaces are skipped quietly: the user already has the load-failed toast,
  // and a throw here would also abort a profile swap.
  await Promise.all(
    all.filter((ns) => !isNamespaceBlocked(profileId, ns)).map((ns) => saveProfileNamespace(profileId, ns)),
  );
}

/** Load store state for a profile */
export async function loadProfileData(profileId: string) {
  bumpProfileEpoch();
  hydratedProfileId = null;
  localOnly.clear();
  // Până se încarcă noul profil, paginile trebuie să arate schelet, nu datele profilului vechi.
  useQuizStore.setState({ _hasHydrated: false });
  useSaveStatusStore.getState().setRecovering('Încărcăm profilul');
  // Deliberately NOT awaited: IndexedDB being slow/unavailable (a broken
  // environment, private-browsing restrictions) must not block
  // quizzes/folders/stats/notes from loading — those don't depend on it. The
  // narrow window before this resolves only affects RAG lookups against the
  // knowledge vault, which self-correct the moment it finishes.
  void setVectorStoreProfile(profileId).catch(() => undefined);
  blockedNamespaces.clear();
  useToastStore.getState().removeToast(LOAD_FAILED_TOAST_ID);
  const failed: ProfileNamespace[] = [];
  const safeRead = async <T,>(ns: ProfileNamespace, legacyKey: string): Promise<T | null> => {
    try {
      return await read<T>(profileId, ns, legacyKey);
    } catch (err) {
      console.error(`[Storage] Load failed for "${ns}":`, err);
      failed.push(ns);
      blockedNamespaces.add(`${profileId}:${ns}`);
      return null;
    }
  };
  const [quizData, folderData, rawStatsData, notesData, aiData] = await Promise.all([
    safeRead<{ quizzes: Quiz[]; sessions: QuizSession[] }>('quizzes', 'studyx-quizzes-v3'),
    safeRead<{ folders: Folder[] }>('folders', 'studyx-folders-v2'),
    safeRead<{ questionStats: Record<string, QuestionStat>; streak: StudyStreak; totalStudyTime: number }>('stats', 'studyx-stats'),
    safeRead<{ notes: Record<string, string> }>('notes', 'studyx-notes'),
    safeRead<{ knowledgeSources: AIKnowledgeSource[]; libraryFolders: AILibraryFolder[] }>('ai', 'ai-store'),
  ]);

  const statsData = rawStatsData?.questionStats && quizData?.quizzes
    ? { ...rawStatsData, questionStats: retireSplitSourceStats(rawStatsData.questionStats, quizData.quizzes) }
    : rawStatsData;

  useQuizStore.getState()._hydrate(quizData ?? { quizzes: [], sessions: [] });
  useFolderStore.getState()._hydrate(folderData ?? { folders: [] });
  useStatsStore.getState()._hydrate(statsData ?? {
    questionStats: {},
    streak: { currentStreak: 0, longestStreak: 0, lastStudyDate: '', studyDates: [] },
    totalStudyTime: 0
  });
  useNotesStore.getState()._hydrate(notesData ?? { notes: {} });
  useAIStore.getState()._hydrate(aiData ?? { knowledgeSources: [], libraryFolders: [] });

  // No JSON.stringify of the loaded blobs: remember the references the stores now hold instead.
  // (A later change produces new references and is serialized then, as before.)
  for (const ns of ['quizzes', 'folders', 'stats', 'notes', 'ai'] as const) {
    const key = `${profileId}:${ns}`;
    lastSerializedSnapshot.delete(key);
    const refs = snapshotRefs(snapshotFor(ns));
    if (refs) lastSavedRefs.set(key, refs); else lastSavedRefs.delete(key);
  }
  // Data that came from a newer localStorage copy is not on disk yet: forget the cache entry so the next save writes it.
  for (const key of localOnly) { lastSerializedSnapshot.delete(key); lastSavedRefs.delete(key); }
  hydratedProfileId = profileId;
  void inheritLegacyVectorsIfOwner(profileId, useAIStore.getState().knowledgeSources.map((source) => source.id)).catch(() => undefined);
  void useAIStore.getState().reconcileInterruptedIndexing().catch(() => undefined);
  if (failed.length > 0) {
    announceLoadFailure(profileId);
    useSaveStatusStore.getState().setError('Încărcare eșuată — salvarea e oprită');
  } else {
    useSaveStatusStore.getState().setSaved('Profil sincronizat');
  }
}

function announceLoadFailure(profileId: string) {
  useToastStore.getState().upsertToast(
    LOAD_FAILED_TOAST_ID,
    'Nu am putut citi datele profilului. Nu salvez nimic peste ele ca să nu le pierzi; modificările din această sesiune rămân în memorie.',
    'error',
    120_000,
    { label: 'Reîncearcă încărcarea', onClick: () => { void retryBlockedProfileLoad(profileId); } },
  );
}

function applyNamespace(ns: ProfileNamespace, data: unknown) {
  switch (ns) {
    case 'quizzes': useQuizStore.getState()._hydrate(data as Parameters<ReturnType<typeof useQuizStore.getState>['_hydrate']>[0]); break;
    case 'folders': useFolderStore.getState()._hydrate(data as Parameters<ReturnType<typeof useFolderStore.getState>['_hydrate']>[0]); break;
    case 'stats': useStatsStore.getState()._hydrate(data as Parameters<ReturnType<typeof useStatsStore.getState>['_hydrate']>[0]); break;
    case 'notes': useNotesStore.getState()._hydrate(data as Parameters<ReturnType<typeof useNotesStore.getState>['_hydrate']>[0]); break;
    case 'ai': useAIStore.getState()._hydrate(data as Parameters<ReturnType<typeof useAIStore.getState>['_hydrate']>[0]); break;
  }
}

/**
 * Re-reads every namespace whose load failed. On success the real data replaces the empty placeholder and
 * saving resumes. If the user already changed that namespace during the blocked session, those in-memory
 * changes are first set aside under a `__session-` localStorage key so they can be recovered; if even that
 * copy cannot be made, the namespace stays blocked. Returns true when nothing is blocked any more.
 */
export async function retryBlockedProfileLoad(profileId: string): Promise<boolean> {
  if (hydratedProfileId !== profileId) return false;
  const all: ProfileNamespace[] = ['quizzes', 'folders', 'stats', 'notes', 'ai'];
  for (const ns of all.filter((n) => isNamespaceBlocked(profileId, n))) {
    let data: unknown;
    try {
      data = await read(profileId, ns);
    } catch {
      continue; // still failing: stays blocked
    }
    if (hydratedProfileId !== profileId) return false; // profile swapped while we were reading
    const key = `${profileId}:${ns}`;
    const dirty = !sameRefs(lastSavedRefs.get(key), snapshotRefs(snapshotFor(ns)));
    if (dirty && data) {
      try {
        localStorage.setItem(`${LS_KEY(profileId, ns)}__session-${Date.now()}`, JSON.stringify(snapshotFor(ns)));
      } catch {
        continue; // cannot preserve the session changes: do not replace them; stay blocked
      }
    }
    // data === null now means a genuinely empty profile (read succeeded, nothing there): session edits stay as they are.
    if (data) applyNamespace(ns, data);
    lastSerializedSnapshot.delete(key);
    if (data || !dirty) {
      const refs = snapshotRefs(snapshotFor(ns));
      if (refs) lastSavedRefs.set(key, refs); else lastSavedRefs.delete(key);
    } else {
      lastSavedRefs.delete(key); // session edits on a confirmed-empty profile: next save must write them
    }
    blockedNamespaces.delete(key);
  }
  const stillBlocked = all.some((n) => isNamespaceBlocked(profileId, n));
  if (stillBlocked) {
    announceLoadFailure(profileId);
  } else {
    useToastStore.getState().removeToast(LOAD_FAILED_TOAST_ID);
    useSaveStatusStore.getState().setSaved('Profil sincronizat');
  }
  return !stillBlocked;
}
