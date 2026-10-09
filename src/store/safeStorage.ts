import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';

const QUARANTINE_SUFFIX = '__corrupt-';
const QUARANTINE_KEEP = 3;

/**
 * Copies bytes we could not read to a timestamped key so the next write (which would
 * overwrite the original with defaults) cannot destroy the only copy. Never throws.
 */
export function quarantineRawBlob(key: string, raw: string): void {
  try {
    localStorage.setItem(`${key}${QUARANTINE_SUFFIX}${Date.now()}`, raw);
    const mine: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${key}${QUARANTINE_SUFFIX}`)) mine.push(k);
    }
    mine.sort().reverse().slice(QUARANTINE_KEEP).forEach((k) => localStorage.removeItem(k));
  } catch {
    // Out of space or storage blocked — nothing more can be done here.
  }
}

/**
 * localStorage for zustand `persist` that survives a corrupt blob: an unparseable value is
 * quarantined and treated as missing (defaults), instead of making hydration fail with the
 * corrupt bytes then being overwritten by the next `set`.
 */
export function createSafePersistStorage<S>(): PersistStorage<S> | undefined {
  const base: StateStorage = {
    getItem: (name) => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(name);
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        JSON.parse(raw);
      } catch {
        quarantineRawBlob(name, raw);
        return null;
      }
      return raw;
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch (err) {
        // Quota/blocked storage must not throw out of a store `set` call.
        console.error(`[Storage] Could not persist "${name}":`, err);
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        // ignore
      }
    },
  };
  return createJSONStorage<S>(() => base);
}
