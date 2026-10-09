/**
 * Folderele proprii de grile din Rezidențiat. Grilele din bănci și cele făcute de AI se așază singure pe specialități, iar
 * folderele pe care le faci tu ar fi invizibile cât sunt goale; aici se listează ca să poți intra în ele, să le umpli sau să le ștergi.
 */
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import type { Folder, Quiz } from '../types';
import { folderPathLabel, folderSubtreeIds, residencyFolderIds } from './flashcardGroups';
import { AI_GRILE_FOLDER_NAME } from './rezidentiatPlacement';

const norm = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface UserQuizFolder {
  folder: Folder;
  /** Calea afișată, fără „Rezidențiat / Grile”. */
  label: string;
  /** Câte seturi sunt în folder și în subfoldere. */
  quizCount: number;
  depth: number;
}

function grileRoot(folders: ReadonlyArray<Folder>): Folder | undefined {
  const root = folders.find((folder) => !folder.parentId && norm(folder.name) === norm('Rezidențiat'));
  return root ? folders.find((folder) => folder.parentId === root.id && norm(folder.name) === norm(AI_GRILE_FOLDER_NAME)) : undefined;
}

/** Toate folderele de sub „Rezidențiat / Grile”, în ordinea arborelui, cu numărul de seturi din ele. */
export function userQuizFolders(folders: ReadonlyArray<Folder>, quizzes: ReadonlyArray<Pick<Quiz, 'folderId' | 'kind' | 'archived'>>): UserQuizFolder[] {
  const root = grileRoot(folders);
  if (!root) return [];
  const inside = folderSubtreeIds(root.id, folders);
  const inRez = residencyFolderIds(folders);
  const rows: UserQuizFolder[] = [];
  const walk = (parentId: string, depth: number) => {
    const children = folders.filter((folder) => folder.parentId === parentId && inside.has(folder.id) && inRez.has(folder.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
    for (const folder of children) {
      const ids = folderSubtreeIds(folder.id, folders);
      const quizCount = quizzes.filter((quiz) => !!quiz.folderId && ids.has(quiz.folderId) && quiz.kind !== 'flashcard' && !quiz.archived).length;
      rows.push({ folder, label: folderPathLabel(folders, folder.id).split(' / ').slice(2).join(' / '), quizCount, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(root.id, 0);
  return rows;
}

/**
 * Șterge un folder de grile. Fără `withQuizzes`, seturile din el (și din subfoldere) trec în „Rezidențiat / Grile”, ca să
 * nu se piardă și să rămână în Rezidențiat; cu `withQuizzes` se șterg și ele.
 */
export function deleteQuizFolder(folderId: string, withQuizzes: boolean): { quizzes: number } {
  const folderStore = useFolderStore.getState();
  const quizStore = useQuizStore.getState();
  const ids = folderSubtreeIds(folderId, folderStore.folders);
  const affected = quizStore.quizzes.filter((quiz) => !!quiz.folderId && ids.has(quiz.folderId));
  if (withQuizzes) {
    if (affected.length > 0) quizStore.bulkDeleteQuizzes(affected.map((quiz) => quiz.id));
  } else {
    const root = grileRoot(folderStore.folders);
    if (affected.length > 0) quizStore.bulkMoveToFolder(affected.map((quiz) => quiz.id), root?.id ?? null);
  }
  folderStore.deleteFolder(folderId);
  return { quizzes: affected.length };
}
