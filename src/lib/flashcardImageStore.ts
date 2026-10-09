/**
 * Persistent storage for flashcard images, separate from the quiz store.
 *
 * Visual decks (e.g. dermatology courses) can hold dozens of photos. Keeping the
 * base64 data inside the quiz snapshot would bloat every save and blow past the
 * LocalStorage quota in the browser build. Images therefore live in IndexedDB,
 * keyed by `${quizId}:${tag}`, and the question only stores an `idb:<key>` pointer.
 */

const DB_NAME = 'studyx-flashcard-images';
const STORE_NAME = 'images';
const DB_VERSION = 1;
const IDB_PREFIX = 'idb:';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });

  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | null> {
  return openDatabase().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let settled = false;
      const finish = (value: T | null) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      try {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = operation(store);
        tx.oncomplete = () => finish(request ? request.result ?? null : null);
        tx.onerror = () => finish(null);
        tx.onabort = () => finish(null);
      } catch {
        finish(null);
      }
    });
  });
}

/** Build the storage key for a quiz/tag pair. */
export function flashcardImageKey(quizId: string, tag: string): string {
  return `${quizId}:${tag}`;
}

/** Build the `idb:` pointer stored on a question's imageUrl field. */
export function flashcardImageRef(quizId: string, tag: string): string {
  return `${IDB_PREFIX}${flashcardImageKey(quizId, tag)}`;
}

/** True when a question's imageUrl points at IndexedDB rather than an inline data URL. */
export function isFlashcardImageRef(src: string | undefined | null): src is string {
  return typeof src === 'string' && src.startsWith(IDB_PREFIX);
}

export async function putFlashcardImage(key: string, dataUrl: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.put(dataUrl, key));
}

export async function getFlashcardImage(refOrKey: string): Promise<string | null> {
  const key = refOrKey.startsWith(IDB_PREFIX) ? refOrKey.slice(IDB_PREFIX.length) : refOrKey;
  const result = await runTransaction<string>('readonly', (store) => store.get(key));
  return typeof result === 'string' ? result : null;
}

/**
 * Quiz ids that currently own stored images. Used to reclaim images whose deck
 * no longer exists — deletion can be deferred (e.g. while an undo is still
 * offered), so something has to sweep up afterwards.
 */
export async function listFlashcardImageQuizIds(): Promise<string[]> {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise<string[]>((resolve) => {
    const ids = new Set<string>();
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string') {
          const separator = cursor.key.indexOf(':');
          if (separator > 0) ids.add(cursor.key.slice(0, separator));
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve([...ids]);
      tx.onerror = () => resolve([...ids]);
      tx.onabort = () => resolve([...ids]);
    } catch {
      resolve([]);
    }
  });
}

/** Remove every image belonging to a quiz (best effort, used on deck deletion). */
export async function deleteFlashcardImagesForQuiz(quizId: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  const prefix = `${quizId}:`;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
