import { useEffect } from 'react';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { currentProfileEpoch } from '../store/profileEpoch';
import { migrateFlashcardFolderScopes } from '../lib/folderScope';

/**
 * După încărcarea profilului, marchează cu scope 'flashcards' folderele vechi făcute din
 * Flashcarduri (înainte de `Folder.scope`). quizStore și folderStore se hidratează în aceeași
 * funcție sincronă, deci `quiz._hasHydrated` înseamnă că ambele sunt gata. Rulează o dată
 * per încărcare de profil (epoch); setarea stării declanșează salvarea normală a folderelor.
 */
export function runFlashcardFolderMigration(): boolean {
  if (!useQuizStore.getState()._hasHydrated) return false;
  const { folders } = useFolderStore.getState();
  const migrated = migrateFlashcardFolderScopes(folders, useQuizStore.getState().quizzes);
  if (migrated === folders) return false;
  useFolderStore.setState({ folders: migrated });
  return true;
}

export function useFlashcardFolderMigration(activeProfileId: string | null) {
  useEffect(() => {
    if (!activeProfileId) return;
    let doneEpoch = -1;
    const attempt = () => {
      const epoch = currentProfileEpoch();
      if (epoch === doneEpoch || !useQuizStore.getState()._hasHydrated) return;
      doneEpoch = epoch;
      runFlashcardFolderMigration();
    };
    attempt();
    return useQuizStore.subscribe(attempt);
  }, [activeProfileId]);
}
