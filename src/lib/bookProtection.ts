/**
 * Protecția cărților de bază (Kumar, Lawrence, Sinopsis): sunt sursa de adevăr pentru Rezidențiat și vin cu aplicația,
 * deci nu se șterg, nu se mută din folderul Rezidențiat și folderul lui nu se șterge și nu se redenumește.
 * Garda stă în store (`aiStore`), nu în interfață; interfața folosește `isProtectedSource` ca să ascundă acțiunile.
 * Excepție: o copie rămasă cu eroare de indexare nu e „carte” încă și se poate înlocui (altfel nu s-ar mai putea repara).
 */
import { isBundledBookFileName } from './bundledBookNames';
import { isRezidentiatRootFolder } from './rezidentiatRoot';

interface ProtectableSource {
  name: string;
  indexStatus?: 'indexing' | 'ready' | 'error';
}

interface FolderLike {
  id: string;
  name: string;
  parentId?: string | null;
}

/** Adevărat pentru o carte de bază (după nume), cu excepția unei copii eșuate. */
export function isProtectedSource(source: ProtectableSource): boolean {
  return isBundledBookFileName(source.name) && source.indexStatus !== 'error';
}

/** Folderul Rezidențiat (rădăcina) din biblioteca AI: nu se șterge și nu se redenumește. */
export function isProtectedFolder(folder: FolderLike): boolean {
  return isRezidentiatRootFolder(folder);
}

/** O carte de bază poate sta doar direct în folderul Rezidențiat. */
export function canMoveProtectedSourceTo(folderId: string | null, folders: ReadonlyArray<FolderLike>): boolean {
  if (!folderId) return false;
  const target = folders.find((folder) => folder.id === folderId);
  return !!target && isRezidentiatRootFolder(target);
}

/** Folderul nu se poate șterge dacă el sau un descendent e rădăcina Rezidențiat sau dacă ține o carte de bază. */
export function isFolderDeletionBlocked(
  folderId: string,
  folders: ReadonlyArray<FolderLike>,
  sources: ReadonlyArray<ProtectableSource & { folderId?: string | null }>,
): boolean {
  const subtree = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && subtree.has(folder.parentId) && !subtree.has(folder.id)) {
        subtree.add(folder.id);
        changed = true;
      }
    }
  }
  if (folders.some((folder) => subtree.has(folder.id) && isRezidentiatRootFolder(folder))) return true;
  return sources.some((source) => !!source.folderId && subtree.has(source.folderId) && isProtectedSource(source));
}
