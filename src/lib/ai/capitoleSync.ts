/**
 * Sincronizarea folderului „Capitole” cu Biblioteca AI: ce fișiere sunt de adăugat, schimbate sau de sărit.
 * Logică pură; citirea discului (Electron) și indexarea rămân în pagina Biblioteca AI.
 */
import { fold } from '../organizare/format';

export interface SyncFile { relPath: string; size: number; mtimeMs: number }

/** Ce se păstrează pe sursa din bibliotecă ca să se poată recunoaște la următoarea sincronizare. */
export type SyncInfo = SyncFile;

/** Un PDF mai mare de atât e aproape sigur o carte scanată: indexarea lui ar dura ore și ar da text slab. */
export const MAX_SYNC_BYTES = 150 * 1024 * 1024;

export type SyncStatus = 'done' | 'new' | 'changed' | 'skip-flashcards' | 'skip-big' | 'skip-unreadable';

export interface PlannedFile extends SyncFile { status: SyncStatus }

export interface DisciplineGroup {
  /** Numele folderului de disciplină din „Capitole” (ex. „Medicina Interna”). */
  name: string;
  files: PlannedFile[];
  /** Fișiere de indexat acum (noi sau schimbate). */
  pending: PlannedFile[];
  pendingBytes: number;
  done: number;
  skipped: number;
}

/** Primul folder de sub „Capitole/” ; fișierele direct în „Capitole” merg la „Altele”. */
export function disciplineOf(relPath: string): string {
  const parts = relPath.split('/').filter(Boolean);
  return parts.length > 2 ? parts[1] : 'Altele';
}

/** Numele sursei în bibliotecă: numele fișierului fără extensie. */
export function sourceNameOf(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.pdf$/i, '');
}

/** Folderele intermediare dintre disciplină și fișier (ex. „Cardiologie/Capitole complete”), pentru subfoldere în bibliotecă. */
export function subfoldersOf(relPath: string): string[] {
  const parts = relPath.split('/').filter(Boolean);
  return parts.length > 3 ? parts.slice(2, -1) : [];
}

const isFlashcards = (relPath: string) => fold(relPath.split('/').pop() ?? '').includes('flashcard');

function statusOf(file: SyncFile, synced: ReadonlyMap<string, SyncInfo>, unreadable: Readonly<Record<string, number>>): SyncStatus {
  const known = synced.get(file.relPath);
  if (known) return known.size === file.size && known.mtimeMs === file.mtimeMs ? 'done' : 'changed';
  if (isFlashcards(file.relPath)) return 'skip-flashcards';
  if (file.size > MAX_SYNC_BYTES) return 'skip-big';
  if (unreadable[file.relPath] === file.size) return 'skip-unreadable';
  return 'new';
}

/**
 * Grupează fișierele pe discipline și le marchează. `synced` = sursele deja legate de un fișier (după `relPath`);
 * `unreadable` = fișiere pe care o încercare anterioară nu a putut scoate text din ele (relPath → mărime).
 */
export function planSync(
  files: readonly SyncFile[],
  synced: ReadonlyMap<string, SyncInfo>,
  unreadable: Readonly<Record<string, number>> = {},
): DisciplineGroup[] {
  const groups = new Map<string, DisciplineGroup>();
  for (const file of files) {
    const name = disciplineOf(file.relPath);
    let group = groups.get(name);
    if (!group) {
      group = { name, files: [], pending: [], pendingBytes: 0, done: 0, skipped: 0 };
      groups.set(name, group);
    }
    const planned: PlannedFile = { ...file, status: statusOf(file, synced, unreadable) };
    group.files.push(planned);
    if (planned.status === 'done') group.done += 1;
    else if (planned.status === 'new' || planned.status === 'changed') {
      group.pending.push(planned);
      group.pendingBytes += planned.size;
    } else group.skipped += 1;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
}
