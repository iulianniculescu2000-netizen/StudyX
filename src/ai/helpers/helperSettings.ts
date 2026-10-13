/**
 * Flagurile ajutătorilor, așa cum le vede aplicația.
 * Implicit: `clarifyGate` pornit (conservator, 0 tokeni, economisește un răspuns întreg), `queryRewrite` oprit.
 * O valoare scrisă explicit de utilizator (în `studyx.aiHelpers`) bate întotdeauna implicitul.
 */
import { HELPER_FLAGS_STORAGE_KEY, type HelperFlags } from './shared';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

const FLAG_KEYS: readonly (keyof HelperFlags)[] = ['queryRewrite', 'clarifyGate'];

export function defaultHelperFlags(): HelperFlags {
  return { queryRewrite: false, clarifyGate: true };
}

function storageOrNull(storage?: FlagStorage | null): FlagStorage | null {
  try {
    return storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  } catch {
    return null;
  }
}

function readExplicit(storage: FlagStorage | null): Partial<HelperFlags> {
  try {
    const raw = storage?.getItem(HELPER_FLAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<keyof HelperFlags, unknown>>;
    const out: Partial<HelperFlags> = {};
    for (const key of FLAG_KEYS) if (typeof parsed?.[key] === 'boolean') out[key] = parsed[key] as boolean;
    return out;
  } catch {
    return {};
  }
}

/** Flagurile efective: implicitul peste care se aplică ce a ales explicit utilizatorul. */
export function resolveHelperFlags(storage?: FlagStorage | null): HelperFlags {
  return { ...defaultHelperFlags(), ...readExplicit(storageOrNull(storage)) };
}

/** Salvează alegerea explicită a unui flag (celelalte alegeri explicite rămân). Eșuează în tăcere. */
export function writeHelperFlag(key: keyof HelperFlags, value: boolean, storage?: FlagStorage | null): void {
  const store = storageOrNull(storage);
  if (!store) return;
  try {
    store.setItem(HELPER_FLAGS_STORAGE_KEY, JSON.stringify({ ...readExplicit(store), [key]: value }));
  } catch {
    // fără stocare: alegerea nu persistă, aplicația merge mai departe
  }
}
