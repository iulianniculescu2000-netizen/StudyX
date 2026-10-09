import type { AILibraryFolder, AIKnowledgeSource } from '../../store/aiStore';
import { isUnderRezidentiatRoot } from '../../lib/rezidentiatRoot';

export type TypeFilter = 'all' | 'pdf' | 'image' | 'indexing';

export const FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'Toate' },
  { id: 'pdf', label: 'Documente' },
  { id: 'image', label: 'Imagini' },
  { id: 'indexing', label: 'În indexare' },
];

/** Lower case, no diacritics, trimmed: "rezidentiat" finds "Rezidențiat". */
export function plainSearchText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Cărțile de Rezidențiat (și folderele lor) trăiesc doar în secțiunea Rezidențiat;
 * Biblioteca AI rămâne pentru restul.
 */
export function scopeVaultToGeneral(
  allFolders: AILibraryFolder[],
  allSources: AIKnowledgeSource[],
): { libraryFolders: AILibraryFolder[]; knowledgeSources: AIKnowledgeSource[] } {
  const rezidentiatFolderIds = new Set(
    allFolders.filter((folder) => isUnderRezidentiatRoot(folder.id, allFolders)).map((folder) => folder.id),
  );
  return {
    libraryFolders: allFolders.filter((folder) => !rezidentiatFolderIds.has(folder.id)),
    knowledgeSources: allSources.filter((source) => !source.folderId || !rezidentiatFolderIds.has(source.folderId)),
  };
}

export function filterByType(sources: AIKnowledgeSource[], typeFilter: TypeFilter): AIKnowledgeSource[] {
  return sources.filter((source) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'image') return source.type === 'image';
    if (typeFilter === 'pdf') return source.type !== 'image';
    return source.indexStatus === 'indexing' || source.indexStatus === 'error';
  });
}

// ── Timeouturi la încărcare ─────────────────────────────────────────────────

const MB = 1024 * 1024;

/**
 * Cât așteptăm citirea unui fișier. Un 20 s fix tăia orice carte: Kumar (~70 MB) are nevoie de peste un minut doar pentru
 * extragerea textului (procesul principal își calculează singur bugetul: 12 s + 1,5 s/MB, plafon 300 s). Aici dăm o marjă
 * peste el, ca renunțarea să vină mereu de la proces, nu de la pagină.
 */
export function readTimeoutMs(sizeBytes: number, kind: 'pdf' | 'docx' | 'image' | 'text'): number {
  const mb = Math.max(0, sizeBytes) / MB;
  if (kind === 'image') return 90_000;
  if (kind === 'text') return 30_000;
  return Math.min(330_000, Math.ceil(45_000 + mb * 3_000));
}

/** Cât timp fără niciun progres de indexare înseamnă că s-a blocat (indexarea în sine nu are plafon de timp). */
export const INDEX_STALL_MS = 120_000;

/**
 * Rulează `task` și îl declară blocat doar dacă nu mai dă semn de viață (`touch()`) `stallMs`. Spre deosebire de un timeout
 * fix, o indexare lungă dar cu progres nu e întreruptă; una blocată cu adevărat da.
 */
export function withStallGuard<T>(task: (touch: () => void) => Promise<T>, stallMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new Error(message)), stallMs);
    };
    arm();
    task(arm).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
