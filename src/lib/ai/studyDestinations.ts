/**
 * Unde ajunge ce generează aplicația: flashcarduri sau grile, în Rezidențiat sau în general.
 *
 * Fiecare combinație are propriul arbore de foldere și propria lui „rădăcină” implicită; aici stă regula unică după care
 * se oferă folderele existente, se creează unul nou (o singură dată) și se descrie destinația în clar. Folosit de
 * „cartea de opțiuni” din chat și, prin `FolderChoice`, de dialogurile din Rezidențiat.
 */
import { useFolderStore } from '../../store/folderStore';
import type { Folder } from '../../types';
import { isFlashcardFolder } from '../folderScope';
import { suggestFolderAppearance } from '../folderAppearance';
import { folderPathLabel, folderSubtreeIds, residencyFolderIds } from '../flashcardGroups';
import {
  FLASHCARDS_ROOT_CHOICE,
  describeFolderChoice,
  ensureFlashcardsRoot,
  flashcardFolderOptions,
  resolveFolderChoice,
  type FolderChoice,
  type FolderOption,
} from '../rezidentiatFlashcardFolders';
import { AI_GRILE_FOLDER_NAME } from '../rezidentiatPlacement';
import { findOrCreateRezidentiatQuizRoot } from '../rezidentiatRoot';
import type { SourceScope } from './sourceScope';

export type StudyKind = 'flashcards' | 'quiz';

/** „Fără folder”: pachetul sau setul stă la Neclasificate / în rădăcina arborelui general. */
export const TREE_ROOT_CHOICE = '__tree_root__';
/** „Rezidențiat / Grile”, care se creează abia când e nevoie de el. */
export const QUIZ_ROOT_CHOICE = '__rezidentiat_grile_root__';
/** Grilele de Rezidențiat fără folder ales: aplicația le pune singură pe specialitate (Cardiologie, Hematologie…). */
export const QUIZ_AUTO_CHOICE = '__rezidentiat_auto__';

const norm = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function childNamed(folders: ReadonlyArray<Folder>, parentId: string | null, name: string): Folder | undefined {
  return folders.find((folder) => (folder.parentId ?? null) === parentId && norm(folder.name) === norm(name));
}

function ensureGrileRoot(): string {
  const root = findOrCreateRezidentiatQuizRoot();
  const store = useFolderStore.getState();
  return childNamed(store.folders, root.id, AI_GRILE_FOLDER_NAME)?.id ?? store.addFolder(AI_GRILE_FOLDER_NAME, '📘', 'blue', root.id);
}

function flashcardsSubtree(folders: ReadonlyArray<Folder>): Set<string> {
  const root = folders.find((folder) => !folder.parentId && norm(folder.name) === norm('Rezidențiat'));
  const space = root ? childNamed(folders, root.id, 'Flashcarduri') : undefined;
  return space ? folderSubtreeIds(space.id, folders) : new Set();
}

/** Folderele după care se alege destinația, în ordinea arborelui, cu etichete scurte. */
export function destinationOptions(kind: StudyKind, space: SourceScope, folders: ReadonlyArray<Folder>): FolderOption[] {
  if (space === 'rezidentiat' && kind === 'flashcards') return flashcardFolderOptions(folders);

  const inRez = residencyFolderIds(folders);
  if (space === 'rezidentiat') {
    const root = folders.find((folder) => !folder.parentId && norm(folder.name) === norm('Rezidențiat'));
    const excluded = flashcardsSubtree(folders);
    const grile = root ? childNamed(folders, root.id, AI_GRILE_FOLDER_NAME) : undefined;
    const options: FolderOption[] = [
      { id: QUIZ_AUTO_CHOICE, label: 'Automat, pe specialitate', depth: 0 },
      { id: grile?.id ?? QUIZ_ROOT_CHOICE, label: AI_GRILE_FOLDER_NAME, depth: 0 },
    ];
    const rows = folders
      .filter((folder) => inRez.has(folder.id) && folder.id !== root?.id && folder.id !== grile?.id && !excluded.has(folder.id))
      .map((folder) => ({ folder, label: folderPathLabel(folders, folder.id).split(' / ').slice(1).join(' / ') }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ro'));
    for (const { folder, label } of rows) options.push({ id: folder.id, label, depth: label.split(' / ').length - 1 });
    return options;
  }

  const wantScope = kind === 'flashcards';
  const own = folders.filter((folder) => !inRez.has(folder.id) && isFlashcardFolder(folder) === wantScope);
  const options: FolderOption[] = [{ id: TREE_ROOT_CHOICE, label: wantScope ? 'Fără folder' : 'Neclasificate', depth: 0 }];
  const rows = own
    .map((folder) => ({ folder, label: folderPathLabel(folders, folder.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ro'));
  for (const { folder, label } of rows) options.push({ id: folder.id, label, depth: label.split(' / ').length - 1 });
  return options;
}

/** Părintele sub care se creează implicit un folder nou. */
export function defaultNewFolderParent(kind: StudyKind, space: SourceScope): string {
  if (space === 'rezidentiat') return kind === 'flashcards' ? FLASHCARDS_ROOT_CHOICE : QUIZ_ROOT_CHOICE;
  return TREE_ROOT_CHOICE;
}

/** Alegerea implicită când utilizatorul nu atinge nimic. */
export function defaultDestinationChoice(kind: StudyKind, space: SourceScope): FolderChoice {
  if (space === 'rezidentiat' && kind === 'quiz') return { mode: 'existing', id: QUIZ_AUTO_CHOICE };
  return { mode: 'existing', id: defaultNewFolderParent(kind, space) };
}

/** Face din alegere un id de folder (`null` = fără folder). Un folder nou se creează o singură dată. */
export function resolveDestination(kind: StudyKind, space: SourceScope, choice: FolderChoice): string | null {
  if (space === 'rezidentiat' && kind === 'flashcards') return resolveFolderChoice(choice);

  const resolveId = (id: string): string | null => {
    if (id === TREE_ROOT_CHOICE || id === QUIZ_AUTO_CHOICE) return null;
    if (id === QUIZ_ROOT_CHOICE) return ensureGrileRoot();
    if (id === FLASHCARDS_ROOT_CHOICE) return ensureFlashcardsRoot();
    return id;
  };
  if (choice.mode === 'existing') return resolveId(choice.id);

  const parentId = resolveId(choice.parentId);
  const name = choice.name.trim().replace(/\s+/g, ' ');
  if (!name) return parentId;
  const store = useFolderStore.getState();
  // În general, un folder nou de flashcarduri trăiește în spațiul Flashcardurilor, ca să nu apară printre grile.
  const scope = space === 'general' && kind === 'flashcards' ? ('flashcards' as const) : undefined;
  // La rădăcină, „Fiziologie” de flashcarduri și „Fiziologie” de grile sunt foldere diferite.
  const existing = store.folders.find((folder) => (folder.parentId ?? null) === parentId && norm(folder.name) === norm(name)
    && (parentId !== null || isFlashcardFolder(folder) === (scope === 'flashcards')));
  if (existing) return existing.id;
  const look = suggestFolderAppearance(name);
  return store.addFolder(name, look.emoji, look.color, parentId, scope);
}

/** Destinația în clar, pentru confirmări („în Flashcarduri / Cardiologie”). */
export function describeDestination(kind: StudyKind, space: SourceScope, choice: FolderChoice, folders: ReadonlyArray<Folder>): string {
  if (space === 'rezidentiat' && kind === 'flashcards') return describeFolderChoice(choice, folders);
  const labelOf = (id: string) => {
    if (id === QUIZ_AUTO_CHOICE) return 'automat, pe specialitate';
    if (id === TREE_ROOT_CHOICE) return kind === 'flashcards' ? 'fără folder' : 'Neclasificate';
    if (id === QUIZ_ROOT_CHOICE) return `Rezidențiat / ${AI_GRILE_FOLDER_NAME}`;
    if (id === FLASHCARDS_ROOT_CHOICE) return 'Rezidențiat / Flashcarduri';
    const path = folderPathLabel(folders, id);
    return path || 'folderul ales';
  };
  if (choice.mode === 'existing') return labelOf(choice.id);
  const parent = labelOf(choice.parentId);
  const name = choice.name.trim() || 'folder nou';
  return choice.parentId === TREE_ROOT_CHOICE ? name : `${parent} / ${name}`;
}
