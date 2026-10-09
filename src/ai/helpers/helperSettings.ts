/**
 * Flagurile ajutătorilor, așa cum le vede aplicația (Setări AI + chat).
 *
 * `readHelperFlags` (shared.ts) rămâne „totul oprit”. Aici se adaugă implicitele conștiente de AI-ul local:
 *   - `queryRewrite` și `answerChecklist`: pornite DOAR cât timp AI-ul local e utilizabil (cost 0, ajută modelul mic);
 *   - `clarifyGate`: pornit (conservator, 0 tokeni, economisește un răspuns întreg);
 *   - restul: oprite.
 * O valoare scrisă explicit de utilizator (în `studyx.aiHelpers`) bate întotdeauna implicitul.
 */
import { HELPER_FLAGS_STORAGE_KEY, type HelperFlags } from './shared';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

const FLAG_KEYS: readonly (keyof HelperFlags)[] = [
  'queryRewrite', 'queryRewriteLlm', 'answerChecklist', 'clarifyGate', 'itemJudge', 'itemRewriteLlm', 'styleAdapter', 'selfCritique',
];

export function defaultHelperFlags(localInUse: boolean): HelperFlags {
  return {
    queryRewrite: localInUse,
    queryRewriteLlm: false,
    answerChecklist: localInUse,
    clarifyGate: true,
    itemJudge: false,
    itemRewriteLlm: false,
    styleAdapter: false,
    selfCritique: false,
  };
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

/** Flagurile efective: implicitul (după `localInUse`) peste care se aplică ce a ales explicit utilizatorul. */
export function resolveHelperFlags(localInUse: boolean, storage?: FlagStorage | null): HelperFlags {
  return { ...defaultHelperFlags(localInUse), ...readExplicit(storageOrNull(storage)) };
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
