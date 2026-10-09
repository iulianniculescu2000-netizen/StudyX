import { useState } from 'react';
import { useFolderStore } from '../../../store/folderStore';
import { suggestFlashcardFolder } from '../../../lib/flashcardPlacement';
import { suggestFolderAppearance } from '../../../lib/folderAppearance';
import type { Folder } from '../../../types';
import { LAST_FOLDER_LS_KEY } from '../cardBuilders';

/** The "Salvează în" folder choice and where an AI deck should land. */
export function useDeckTarget(folders: Folder[]) {
  const addFolder = useFolderStore((state) => state.addFolder);
  const [targetFolderId, setTargetFolderId] = useState<string>(() => {
    if (typeof localStorage === 'undefined') return '__uncategorized__';
    return localStorage.getItem(LAST_FOLDER_LS_KEY) ?? '__uncategorized__';
  });

  const selectedFolder = targetFolderId === '__uncategorized__'
    ? null
    : folders.find((folder) => folder.id === targetFolderId) ?? null;

  // Remember the last chosen folder so AI decks stop landing in "Neclasificate".
  const handleTargetFolderChange = (folderId: string) => {
    setTargetFolderId(folderId);
    try { localStorage.setItem(LAST_FOLDER_LS_KEY, folderId); } catch { /* ignore */ }
  };

  // Create a folder (or subfolder) inline from the flashcard hub — with a
  // name-aware icon/color so it looks intentional, not a generic 📚.
  const handleCreateFolder = (name: string, parentId: string | null): string => {
    const appearance = suggestFolderAppearance(name);
    return addFolder(name, parentId ? '📁' : appearance.emoji, appearance.color, parentId, 'flashcards');
  };

  // Where an AI deck goes: the folder picked in "Salvează în", else a folder whose
  // name matches the course, else Neclasificate.
  const resolveGeneratedFolder = (sourceName: string): { folder: Folder | null; suggested: boolean } => {
    if (selectedFolder) return { folder: selectedFolder, suggested: false };
    const match = suggestFlashcardFolder(sourceName, folders);
    return { folder: match, suggested: match !== null };
  };

  return { targetFolderId, selectedFolder, handleTargetFolderChange, handleCreateFolder, resolveGeneratedFolder };
}

export type DeckTarget = ReturnType<typeof useDeckTarget>;
