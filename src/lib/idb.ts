/**
 * Simple IndexedDB wrapper for storing large amounts of text (Knowledge Vault)
 * overcoming the 5MB localStorage limits.
 */
const DB_NAME = 'StudyX_Vault';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const OPEN_TIMEOUT_MS = 12000;
const OPERATION_TIMEOUT_MS = 15000;

let dbPromise: Promise<IDBDatabase> | null = null;
let dbInstance: IDBDatabase | null = null;

function resetDBConnection() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore close failures; we'll recreate the connection on next access.
    }
  }
  dbInstance = null;
  dbPromise = null;
}

function bindDBLifecycle(db: IDBDatabase) {
  db.onclose = () => {
    if (dbInstance === db) {
      dbInstance = null;
      dbPromise = null;
    }
  };
  db.onversionchange = () => {
    try {
      db.close();
    } catch {
      // Ignore versionchange close failures; stale handles are dropped below.
    }
    if (dbInstance === db) {
      dbInstance = null;
      dbPromise = null;
    }
  };
}

function getDB(forceFresh = false): Promise<IDBDatabase> {
  if (forceFresh) resetDBConnection();
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const timeout = window.setTimeout(() => {
      request.onerror = null;
      request.onsuccess = null;
      request.onblocked = null;
      reject(new Error('IndexedDB open timeout'));
    }, OPEN_TIMEOUT_MS);

    request.onerror = () => {
      window.clearTimeout(timeout);
      resetDBConnection();
      reject(request.error ?? new Error('IndexedDB open failed'));
    };
    request.onblocked = () => {
      window.clearTimeout(timeout);
      resetDBConnection();
      reject(new Error('IndexedDB is blocked by another connection'));
    };
    request.onsuccess = () => {
      window.clearTimeout(timeout);
      dbInstance = request.result;
      bindDBLifecycle(dbInstance);
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
  return dbPromise;
}

async function runOperation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  attempt = 0,
): Promise<T> {
  try {
    const db = await getDB(attempt > 0);

    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      let result: T;
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = action(store);

      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          transaction.abort();
        } catch {
          // Ignore abort failures when the transaction is already closed.
        }
        resetDBConnection();
        reject(new Error(`IndexedDB ${mode} timeout`));
      }, OPERATION_TIMEOUT_MS);

      const finishReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error || 'IndexedDB operation failed')));
      };

      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => {
        finishReject(request.error ?? new Error('IndexedDB request failed'));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(result);
      };
      transaction.onabort = () => {
        finishReject(transaction.error ?? request.error ?? new Error('IndexedDB transaction aborted'));
      };
      transaction.onerror = () => {
        finishReject(transaction.error ?? request.error ?? new Error('IndexedDB transaction failed'));
      };
    });
  } catch (error) {
    if (attempt < 1) {
      resetDBConnection();
      return runOperation(mode, action, attempt + 1);
    }
    throw error;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  await runOperation('readwrite', (store) => store.put(value, key));
}

export async function idbGet<T>(key: string): Promise<T | null> {
  return runOperation<T | null>('readonly', (store) => store.get(key));
}

export async function idbRemove(key: string): Promise<void> {
  await runOperation('readwrite', (store) => store.delete(key));
}
