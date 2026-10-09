/**
 * Folderul-rădăcină al materialelor (cel cu `Carti` și `Capitole`). Se salvează per profil în pagină (localStorage, separat pe
 * origine: `localhost` în dezvoltare, `file://` în aplicația instalată) ȘI pe disc, în folderul de date al aplicației, ca
 * aplicația instalată și `start.bat` să vadă același folder. Dacă lipsește sau e greșit, aplicația îl caută singură
 * (corectare: subfolder/părinte/vecin; detecție: Desktop, Documente, Descărcări, Drive) și abia la urmă cere alegerea.
 */
import { bridge } from '../components/pdf/bridge';
import { BOOK_FILES } from './bookPages';
import { useOrganizareStore } from '../store/organizareStore';
import { useToastStore } from '../store/toastStore';

export interface ResolveRootResult {
  ok: boolean;
  root?: string;
  via?: 'same' | 'parent' | 'child' | 'other';
  books?: number;
  hasCapitole?: boolean;
  code?: string;
}

/** Cărțile compilate pe care aplicația le caută: ele decid care folder e cel bun când sunt mai multe asemănătoare. */
export const EXPECTED_BOOK_FILES: string[] = Object.values(BOOK_FILES);

export const canResolveRoot = (): boolean => typeof bridge()?.organizareResolveRoot === 'function';

/** Cere procesului principal folderul bun pornind de la `root`; `null` dacă nu există punte (varianta web) sau nu se găsește. */
export async function resolveMaterialsRoot(root: string): Promise<ResolveRootResult | null> {
  const api = bridge();
  if (!api?.organizareResolveRoot) return null;
  try {
    return await api.organizareResolveRoot(root, EXPECTED_BOOK_FILES);
  } catch {
    return null;
  }
}

/** Caută singur folderul cu materialele în locurile obișnuite; `null` dacă nu există punte sau nu se găsește. */
export async function detectMaterialsRoot(): Promise<ResolveRootResult | null> {
  const api = bridge();
  if (!api?.organizareDetectRoot) return null;
  try {
    return await api.organizareDetectRoot(EXPECTED_BOOK_FILES);
  } catch {
    return null;
  }
}

/** „Desktop\\Rezidentiat” scurt, pentru mesaje: ultimele două părți ale căii. */
export function shortPath(full: string): string {
  const parts = full.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join('\\');
}

/** Salvează folderul în pagină și pe disc (eșecul scrierii pe disc nu oprește nimic). */
function saveRoot(profileId: string, root: string): void {
  useOrganizareStore.getState().setRoot(profileId, root);
  void bridge()?.organizareRootSet?.(profileId, root)?.catch?.(() => undefined);
}

/**
 * Rădăcina bună pentru profil. Ordinea: cea salvată (în pagină sau pe disc) → corectată dacă e greșită → detectată singură →
 * (doar cu `pickIfMissing`) aleasă de utilizator. `forcePick` sare direct la alegere. Întoarce `null` dacă nu s-a ajuns la un
 * folder cu materiale.
 */
export async function ensureMaterialsRoot(profileId: string, opts: { pickIfMissing: boolean; forcePick?: boolean }): Promise<string | null> {
  const toast = useToastStore.getState().addToast;
  const found = (root: string, from?: string) => {
    saveRoot(profileId, root);
    if (from !== undefined && root !== from) toast(`Am găsit materialele în „${shortPath(root)}”; folosesc acest folder.`, 'info');
    return root;
  };

  if (!opts.forcePick) {
    let saved = useOrganizareStore.getState().byProfile[profileId]?.root ?? null;
    if (!saved) {
      try {
        saved = (await bridge()?.organizareRootGet?.(profileId)) ?? null;
      } catch {
        saved = null;
      }
    }
    if (saved) {
      const res = await resolveMaterialsRoot(saved);
      if (res?.ok && res.root) return found(res.root, saved);
    }
    // Nimic salvat sau salvatul nu mai e bun: îl căutăm singuri înainte să cerem ceva utilizatorului.
    const detected = await detectMaterialsRoot();
    if (detected?.ok && detected.root) return found(detected.root, saved ?? '');
  }
  if (!opts.pickIfMissing) return null;

  const picked = await bridge()?.organizarePickRoot?.();
  if (!picked) return null;
  const res = await resolveMaterialsRoot(picked);
  if (res?.ok && res.root) return found(res.root, picked);
  // Alegerea nu conține nici „Carti”, nici „Capitole”: o păstrăm (poate e un folder nou), dar spunem ce lipsește.
  saveRoot(profileId, picked);
  toast('În folderul ales nu găsesc „Carti” sau „Capitole”. Alege folderul care le conține (de ex. Rezidentiat).', 'warning');
  return null;
}
