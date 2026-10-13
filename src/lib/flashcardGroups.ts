/**
 * Logica pură din spatele listei de pachete din Flashcarduri: arborele de grupuri pe foldere (cu
 * subfoldere, foldere goale, cicluri și părinți lipsă), restantele agregate, filtrul
 * Toate / Rezidențiat / Altele, gruparea pe discipline, meniul „Mută în…” și efectul ștergerii unui folder.
 * Nu atinge store-urile (în afară de ce importă clasificarea Rezidențiat existentă), ca să se poată testa singură.
 */
import type { Folder, Quiz } from '../types';
import { CHAPTER_FOLDER_NAME, chapterOfDeck, REZIDENTIAT_TAG } from './chapterDecks';
import { BOOK_NAMES, BOOK_SHORT } from './curriculum';
import { bookDisciplineHint, disciplineKey } from './rezidentiatOverview';
import { findRezidentiatRootFolder } from './rezidentiatRoot';
import { rezidentiatHrefForFolder } from './rezidentiatRoutes';

export const UNCATEGORIZED_ID = '__uncategorized__';
export const UNCATEGORIZED_LABEL = 'Neclasificate';

/** Ce are nevoie logica de la un pachet; `FlashcardDeckSummary` din pagină o satisface. */
export interface DeckLike {
  quiz: Pick<Quiz, 'id' | 'title' | 'folderId' | 'tags'>;
  due: number;
  total: number;
}

export type FolderLike = Pick<Folder, 'id' | 'name' | 'emoji'> & Partial<Pick<Folder, 'color' | 'parentId'>>;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ro', { numeric: true });

/* ─────────────────────────── Arborele de grupuri ─────────────────────────── */

export interface GroupNode<T extends DeckLike = DeckLike> {
  /** Id-ul folderului sau `UNCATEGORIZED_ID`. */
  id: string;
  folder: Folder | null;
  depth: number;
  /** Pachetele din acest folder, fără cele din subfoldere. */
  decks: T[];
  children: GroupNode<T>[];
  /** Pachete în folder și în toate subfolderele. */
  deckCount: number;
  /** Restante în folder și în toate subfolderele. */
  due: number;
}

export interface BuildTreeOptions {
  /** Folderele fără niciun pachet rămân în arbore (cu „Trage pachete aici”). Implicit: da. */
  showEmpty?: boolean;
}

/** Id-urile folderelor care fac parte dintr-un ciclu de `parentId` (sunt tratate ca rădăcini). */
function foldersInCycles(byId: Map<string, Folder>): Set<string> {
  const cyclic = new Set<string>();
  for (const folder of byId.values()) {
    const seen = new Set<string>();
    let current = folder.parentId ? byId.get(folder.parentId) : undefined;
    while (current && !seen.has(current.id)) {
      if (current.id === folder.id) { cyclic.add(folder.id); break; }
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return cyclic;
}

/** Id-urile folderului dat și ale tuturor urmașilor lui (rezistent la cicluri). */
export function folderSubtreeIds(folderId: string, folders: ReadonlyArray<Pick<Folder, 'id' | 'parentId'>>): Set<string> {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); grew = true; }
    }
  }
  return ids;
}

/** Id-urile folderelor din Rezidențiat (rădăcina și tot ce e sub ea). */
export function residencyFolderIds(folders: ReadonlyArray<Folder>): Set<string> {
  const root = findRezidentiatRootFolder([...folders]);
  return root ? folderSubtreeIds(root.id, folders) : new Set();
}

/**
 * Folderele care aparțin unui hub: Rezidențiat › Flashcarduri vede doar arborele Rezidențiat, hub-ul general doar
 * restul. Un folder de alt spațiu rămâne doar dacă ține un pachet afișat aici (împreună cu părinții lui).
 */
export function foldersForHubScope(
  folders: ReadonlyArray<Folder>,
  decks: ReadonlyArray<{ quiz: { folderId?: string | null } }>,
  rezScope: boolean,
): Folder[] {
  const residency = residencyFolderIds(folders);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const needed = new Set<string>();
  for (const deck of decks) {
    let cursor = deck.quiz.folderId ? byId.get(deck.quiz.folderId) : undefined;
    while (cursor && !needed.has(cursor.id)) {
      needed.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
  return folders.filter((folder) => residency.has(folder.id) === rezScope || needed.has(folder.id));
}

/**
 * Pachetele grupate pe foldere, ca arbore. Un pachet fără folder sau cu folder inexistent merge la
 * „Neclasificate” (ultimul). Un folder cu părinte lipsă sau într-un ciclu devine rădăcină. Folderele goale
 * rămân (dacă `showEmpty`), mai puțin cele din Rezidențiat, care se umplu singure după reguli.
 */
/**
 * Folderele din „Rezidențiat / Flashcarduri” făcute de utilizator: se văd și goale (spre deosebire de restul
 * arborelui Rezidențiat, care se umple singur). Folderele pe cărți („Kumar”, „Lawrence”, „Sinopsis”) rămân ale aplicației.
 */
export function userFlashcardSpaceIds(folders: ReadonlyArray<Folder>): Set<string> {
  const root = findRezidentiatRootFolder([...folders]);
  if (!root) return new Set();
  const norm = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const space = folders.find((folder) => folder.parentId === root.id && norm(folder.name) === norm(CHAPTER_FOLDER_NAME));
  if (!space) return new Set();
  const bookFolders = new Set(Object.values(BOOK_SHORT).map(norm));
  const inside = folderSubtreeIds(space.id, folders);
  const out = new Set<string>();
  for (const folder of folders) {
    if (!inside.has(folder.id) || folder.id === space.id) continue;
    if (folder.parentId === space.id && bookFolders.has(norm(folder.name))) continue;
    out.add(folder.id);
  }
  return out;
}

export function buildGroupTree<T extends DeckLike>(
  folders: ReadonlyArray<Folder>,
  decks: ReadonlyArray<T>,
  { showEmpty = true }: BuildTreeOptions = {},
): GroupNode<T>[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const cyclic = foldersInCycles(byId);
  const residency = residencyFolderIds(folders);
  const userSpace = userFlashcardSpaceIds(folders);

  const decksOf = new Map<string, T[]>();
  const loose: T[] = [];
  for (const deck of decks) {
    const folderId = deck.quiz.folderId;
    if (folderId && byId.has(folderId)) {
      const bucket = decksOf.get(folderId);
      if (bucket) bucket.push(deck); else decksOf.set(folderId, [deck]);
    } else {
      loose.push(deck);
    }
  }

  const childrenOf = new Map<string, Folder[]>();
  const roots: Folder[] = [];
  for (const folder of folders) {
    const parent = folder.parentId && !cyclic.has(folder.id) ? byId.get(folder.parentId) : undefined;
    if (!parent) { roots.push(folder); continue; }
    const bucket = childrenOf.get(parent.id);
    if (bucket) bucket.push(folder); else childrenOf.set(parent.id, [folder]);
  }

  const build = (folder: Folder, depth: number): GroupNode<T> | null => {
    const children = (childrenOf.get(folder.id) ?? [])
      .slice()
      .sort(byName)
      .map((child) => build(child, depth + 1))
      .filter((child): child is GroupNode<T> => child !== null);
    const own = decksOf.get(folder.id) ?? [];
    const deckCount = own.length + children.reduce((sum, child) => sum + child.deckCount, 0);
    const due = own.reduce((sum, deck) => sum + deck.due, 0) + children.reduce((sum, child) => sum + child.due, 0);
    // Un folder gol rămâne dacă e al Flashcardurilor (scope) sau făcut de utilizator în Rezidențiat › Flashcarduri; nu un
    // folder de grile și nu restul arborelui Rezidențiat. Un părinte rămâne cât timp are copii care rămân.
    const mayStayEmpty = userSpace.has(folder.id) || (!residency.has(folder.id) && folder.scope === 'flashcards');
    if (deckCount === 0 && children.length === 0 && (!showEmpty || !mayStayEmpty)) return null;
    return { id: folder.id, folder, depth, decks: own, children, deckCount, due };
  };

  const tree = roots
    .slice()
    .sort(byName)
    .map((folder) => build(folder, 0))
    .filter((node): node is GroupNode<T> => node !== null);

  if (loose.length > 0) {
    tree.push({
      id: UNCATEGORIZED_ID,
      folder: null,
      depth: 0,
      decks: loose,
      children: [],
      deckCount: loose.length,
      due: loose.reduce((sum, deck) => sum + deck.due, 0),
    });
  }
  return tree;
}

/** Grupurile cu restante sunt deschise implicit, la fel și cele goale (arată „Trage pachete aici”). */
export function isGroupOpenByDefault(node: Pick<GroupNode, 'due' | 'deckCount'>): boolean {
  return node.due > 0 || node.deckCount === 0;
}

/** Numărul de grupuri din arbore (inclusiv subgrupuri). */
export function countGroups(tree: ReadonlyArray<GroupNode>): number {
  return tree.reduce((sum, node) => sum + 1 + countGroups(node.children), 0);
}

/* ─────────────────────────── Rezidențiat / Altele ─────────────────────────── */

export type DeckFilter = 'toate' | 'rezidentiat' | 'altele';
export type DisciplineId = NonNullable<ReturnType<typeof bookDisciplineHint>>;

export interface ResidencyContext {
  root: Folder | null;
  /** Folderele din Rezidențiat (rădăcina inclusă). */
  folderIds: Set<string>;
  /** Pentru fiecare folder din Rezidențiat: disciplina lui (după numele folderului-disciplină de sub rădăcină), dacă se știe. */
  disciplineOfFolder: Map<string, DisciplineId | null>;
  /** Folderul-disciplină de sub rădăcină, pe disciplină. */
  disciplineFolders: Map<DisciplineId, Folder>;
}

export function buildResidencyContext(folders: ReadonlyArray<Folder>): ResidencyContext {
  const root = findRezidentiatRootFolder([...folders]);
  const folderIds = root ? folderSubtreeIds(root.id, folders) : new Set<string>();
  const disciplineOfFolder = new Map<string, DisciplineId | null>();
  const disciplineFolders = new Map<DisciplineId, Folder>();
  if (root) {
    for (const child of folders.filter((folder) => folder.parentId === root.id)) {
      const key = disciplineKey(child.name);
      if (key && !disciplineFolders.has(key)) disciplineFolders.set(key, child);
      for (const id of folderSubtreeIds(child.id, folders)) disciplineOfFolder.set(id, key);
    }
    disciplineOfFolder.set(root.id, null);
  }
  return { root, folderIds, disciplineOfFolder, disciplineFolders };
}

export interface ResidencyClass {
  /** Disciplina cărții/folderului, sau null când pachetul e de Rezidențiat dar fără disciplină clară (ex. Sinopsis). */
  discipline: DisciplineId | null;
}

/**
 * Cărui domeniu al Rezidențiatului îi aparține un pachet, sau null dacă nu e de Rezidențiat. Reutilizează
 * regulile existente: pachetele pe capitole (taguri `chapter:`/`book:`), cărțile Kumar/Lawrence din tagurile
 * pachetelor AI (`bookDisciplineHint`), tagul `rezidentiat` și folderul Rezidențiat sau urmașii lui.
 */
export function classifyResidencyDeck(
  quiz: Pick<Quiz, 'tags' | 'folderId'>,
  context: ResidencyContext,
): ResidencyClass | null {
  const tags = quiz.tags ?? [];
  const chapter = chapterOfDeck({ tags });
  const fromBook = chapter ? bookDisciplineHint(BOOK_NAMES[chapter.book]) : tags.map(bookDisciplineHint).find((hint) => hint !== null) ?? null;
  const inRoot = !!quiz.folderId && context.folderIds.has(quiz.folderId);
  const tagged = !!chapter || tags.includes(REZIDENTIAT_TAG) || tags.some((tag) => /^book:[KLS]$/.test(tag));
  if (!inRoot && !tagged && fromBook === null) return null;
  const fromFolder = inRoot && quiz.folderId ? context.disciplineOfFolder.get(quiz.folderId) ?? null : null;
  return { discipline: fromBook ?? fromFolder };
}

export function filterByDeckFilter<T extends DeckLike>(decks: ReadonlyArray<T>, filter: DeckFilter, context: ResidencyContext): T[] {
  if (filter === 'toate') return decks.slice();
  return decks.filter((deck) => (classifyResidencyDeck(deck.quiz, context) !== null) === (filter === 'rezidentiat'));
}

export interface DisciplineGroup<T extends DeckLike = DeckLike> {
  /** `chirurgie`, `medicina-interna` sau `alte`. */
  id: DisciplineId | 'alte';
  label: string;
  /** Ruta reală din Rezidențiat: pagina disciplinei, sau `/rezidentiat` când nu avem folder pentru ea. */
  href: string;
  folder: Folder | null;
  decks: T[];
  due: number;
}

const DISCIPLINE_LABELS: Record<DisciplineId, string> = {
  'medicina-interna': 'Medicină internă',
  chirurgie: 'Chirurgie',
};
const DISCIPLINE_ORDER: Array<DisciplineId | 'alte'> = ['medicina-interna', 'chirurgie', 'alte'];

/** Pachetele de Rezidențiat grupate pe disciplină (doar grupurile cu pachete), cu ruta paginii disciplinei. */
export function groupByDiscipline<T extends DeckLike>(
  decks: ReadonlyArray<T>,
  folders: ReadonlyArray<Folder>,
  context: ResidencyContext = buildResidencyContext(folders),
): DisciplineGroup<T>[] {
  const buckets = new Map<DisciplineId | 'alte', T[]>();
  for (const deck of decks) {
    const klass = classifyResidencyDeck(deck.quiz, context);
    if (!klass) continue;
    const key = klass.discipline ?? 'alte';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(deck); else buckets.set(key, [deck]);
  }
  return DISCIPLINE_ORDER.filter((id) => buckets.has(id)).map((id) => {
    const list = buckets.get(id)!;
    const folder = id === 'alte' ? null : context.disciplineFolders.get(id) ?? null;
    return {
      id,
      label: id === 'alte' ? 'Alte carduri de Rezidențiat' : folder?.name ?? DISCIPLINE_LABELS[id],
      href: (folder && rezidentiatHrefForFolder(folder.id, [...folders])) ?? '/rezidentiat',
      folder,
      decks: list,
      due: list.reduce((sum, deck) => sum + deck.due, 0),
    };
  });
}

/* ─────────────────────────── „Mută în…” ─────────────────────────── */

export interface FolderOption {
  /** null = Neclasificate. */
  id: string | null;
  emoji: string;
  /** Calea completă: „Rezidențiat / Chirurgie”. */
  label: string;
  depth: number;
}

/** Calea unui folder („Părinte / Copil”), rezistentă la cicluri și părinți lipsă. */
export function folderPathLabel(folders: ReadonlyArray<Pick<Folder, 'id' | 'name' | 'parentId'>>, folderId: string): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(' / ');
}

/** Lista pentru „Mută în…”: Neclasificate, apoi folderele în ordinea arborelui, fiecare cu calea lui. */
export function folderOptions(folders: ReadonlyArray<Folder>): FolderOption[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const cyclic = foldersInCycles(byId);
  const childrenOf = new Map<string, Folder[]>();
  const roots: Folder[] = [];
  for (const folder of folders) {
    const parent = folder.parentId && !cyclic.has(folder.id) ? byId.get(folder.parentId) : undefined;
    if (!parent) { roots.push(folder); continue; }
    const bucket = childrenOf.get(parent.id);
    if (bucket) bucket.push(folder); else childrenOf.set(parent.id, [folder]);
  }
  const out: FolderOption[] = [{ id: null, emoji: '', label: UNCATEGORIZED_LABEL, depth: 0 }];
  const walk = (folder: Folder, depth: number) => {
    out.push({ id: folder.id, emoji: folder.emoji, label: folderPathLabel(folders, folder.id), depth });
    for (const child of (childrenOf.get(folder.id) ?? []).slice().sort(byName)) walk(child, depth + 1);
  };
  for (const folder of roots.slice().sort(byName)) walk(folder, 0);
  return out;
}

export type MovePlan =
  | { kind: 'noop'; targetName: string }
  | { kind: 'invalid'; targetName: string }
  | { kind: 'move'; targetId: string | null; targetName: string; previousId: string | null };

/** Ce se întâmplă când mutăm un pachet în `targetId` (null = Neclasificate). */
export function planMove(
  deck: Pick<Quiz, 'folderId'>,
  targetId: string | null,
  folders: ReadonlyArray<Pick<Folder, 'id' | 'name'>>,
): MovePlan {
  const target = targetId ? folders.find((folder) => folder.id === targetId) : null;
  if (targetId && !target) return { kind: 'invalid', targetName: '' };
  const targetName = target?.name ?? UNCATEGORIZED_LABEL;
  const current = deck.folderId && folders.some((folder) => folder.id === deck.folderId) ? deck.folderId : null;
  if (current === (targetId ?? null)) return { kind: 'noop', targetName };
  return { kind: 'move', targetId: targetId ?? null, targetName, previousId: deck.folderId ?? null };
}

/* ─────────────────────────── Ștergerea unui folder ─────────────────────────── */

export interface FolderDeleteImpact {
  /** Subfolderele care se șterg odată cu el (folderul însuși nu e numărat). */
  subfolders: number;
  /** Pachete de flashcarduri care trec la Neclasificate. */
  decks: number;
  /** Alte seturi (grile) din același folder, care trec și ele la Neclasificate. */
  otherSets: number;
  /** Folderul și urmașii lui. */
  ids: Set<string>;
}

/** `folderStore.deleteFolder` șterge folderul și urmașii lui și scoate din ei seturile (ajung la Neclasificate), fără să le șteargă. */
export function folderDeleteImpact(
  folderId: string,
  folders: ReadonlyArray<Pick<Folder, 'id' | 'parentId'>>,
  quizzes: ReadonlyArray<Pick<Quiz, 'folderId' | 'kind' | 'tags' | 'questions' | 'archived'>>,
  isDeck: (quiz: Pick<Quiz, 'kind' | 'tags' | 'questions'>) => boolean,
): FolderDeleteImpact {
  const ids = folderSubtreeIds(folderId, folders);
  let decks = 0;
  let otherSets = 0;
  for (const quiz of quizzes) {
    if (!quiz.folderId || !ids.has(quiz.folderId)) continue;
    if (isDeck(quiz)) decks += 1; else otherSets += 1;
  }
  return { subfolders: ids.size - 1, decks, otherSets, ids };
}

/* ─────────────────────────── Preferințe pe profil ─────────────────────────── */

export interface HubListPrefs {
  filter: DeckFilter;
  /** Alegerea explicită a utilizatorului pe grup; ce lipsește se decide după restante. */
  open: Record<string, boolean>;
}

export const DEFAULT_HUB_PREFS: HubListPrefs = { filter: 'toate', open: {} };

export const hubPrefsKey = (profileId: string | null | undefined) => `studyx-p-${profileId ?? 'default'}-flashcard-hub-list`;

export function parseHubPrefs(raw: string | null): HubListPrefs {
  if (!raw) return DEFAULT_HUB_PREFS;
  try {
    const data = JSON.parse(raw) as { filter?: unknown; open?: unknown };
    const filter: DeckFilter = data.filter === 'rezidentiat' || data.filter === 'altele' ? data.filter : 'toate';
    const open: Record<string, boolean> = {};
    if (data.open && typeof data.open === 'object') {
      for (const [key, value] of Object.entries(data.open as Record<string, unknown>)) if (typeof value === 'boolean') open[key] = value;
    }
    return { filter, open };
  } catch {
    return DEFAULT_HUB_PREFS;
  }
}

export function readHubPrefs(profileId: string | null | undefined): HubListPrefs {
  try {
    return parseHubPrefs(localStorage.getItem(hubPrefsKey(profileId)));
  } catch {
    return DEFAULT_HUB_PREFS;
  }
}

export function writeHubPrefs(profileId: string | null | undefined, prefs: HubListPrefs): void {
  try {
    localStorage.setItem(hubPrefsKey(profileId), JSON.stringify(prefs));
  } catch {
    /* spațiu plin sau stocare blocată: preferința rămâne doar pe sesiune */
  }
}
