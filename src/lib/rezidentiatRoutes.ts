import { isRezidentiatRootFolder } from './rezidentiatRoot';

interface RouteFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

/**
 * Where a folder should be browsed. Folders inside the Rezidențiat tree live on
 * the Rezidențiat pages (root → discipline → specialty); every other folder
 * keeps the generic folder view. Returns null when the folder isn't one of the
 * three Rezidențiat levels (deeper folders stay on the generic view).
 */
export function rezidentiatHrefForFolder(folderId: string, folders: RouteFolder[]): string | null {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return null;
  if (isRezidentiatRootFolder(folder)) return '/rezidentiat';

  const parent = folder.parentId ? folders.find((f) => f.id === folder.parentId) : undefined;
  if (!parent) return null;
  if (isRezidentiatRootFolder(parent)) return `/rezidentiat/${folder.id}`;

  const grandparent = parent.parentId ? folders.find((f) => f.id === parent.parentId) : undefined;
  if (grandparent && isRezidentiatRootFolder(grandparent)) return `/rezidentiat/${parent.id}?s=${folder.id}`;
  return null;
}

/** Same as {@link rezidentiatHrefForFolder}, falling back to the generic folder view. */
export function folderHref(folderId: string, folders: RouteFolder[]): string {
  return rezidentiatHrefForFolder(folderId, folders) ?? `/folder/${folderId}`;
}
