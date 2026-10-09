import { useCallback, useMemo, useState } from 'react';
import type { Folder, Quiz } from '../../types';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { isFlashcardDeck } from '../../lib/deckKind';
import { folderDeleteImpact } from '../../lib/flashcardGroups';

/** Ștergerea unui pachet: dialog de confirmare + toast. */
export function useDeckDeletion() {
  const deleteQuiz = useQuizStore((state) => state.deleteQuiz);
  const addToast = useToastStore((state) => state.addToast);
  // Păstrate și după închidere, ca textul dialogului să nu se golească în timpul animației.
  const [deckToDelete, setDeckToDelete] = useState<Quiz | null>(null);
  const [deckDeleteOpen, setDeckDeleteOpen] = useState(false);

  const requestDeckDelete = useCallback((quiz: Quiz) => { setDeckToDelete(quiz); setDeckDeleteOpen(true); }, []);
  const closeDeckDelete = () => setDeckDeleteOpen(false);
  const confirmDeckDelete = () => {
    if (deckToDelete) {
      deleteQuiz(deckToDelete.id);
      addToast(`Pachetul „${deckToDelete.title}" a fost șters.`, 'success');
    }
    setDeckDeleteOpen(false);
  };

  return { deckToDelete, deckDeleteOpen, requestDeckDelete, closeDeckDelete, confirmDeckDelete };
}

/** Ștergerea unui folder (cu sau fără pachetele lui), cu „Anulează” care readuce folderul și așezarea seturilor. */
export function useFolderDeletion(folders: Folder[]) {
  const addToast = useToastStore((state) => state.addToast);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [folderDeleteOpen, setFolderDeleteOpen] = useState(false);

  const folderImpact = useMemo(
    () => (folderToDelete
      ? folderDeleteImpact(folderToDelete.id, folders, useQuizStore.getState().quizzes, isFlashcardDeck)
      : null),
    // Recalculat când se deschide dialogul (și când se schimbă folderele), nu la fiecare schimbare de pachete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folderToDelete, folderDeleteOpen, folders],
  );

  const requestFolderDelete = (folder: Folder) => { setFolderToDelete(folder); setFolderDeleteOpen(true); };
  const closeFolderDelete = () => setFolderDeleteOpen(false);

  const confirmFolderDelete = (withDecks = false) => {
    const target = folderToDelete;
    setFolderDeleteOpen(false);
    if (!target) return;
    const store = useFolderStore.getState();
    const impact = folderDeleteImpact(target.id, store.folders, useQuizStore.getState().quizzes, isFlashcardDeck);
    // Ținem minte unde era fiecare set, ca „Anulează” să-l readucă la locul lui.
    const placements = new Map<string, string[]>();
    for (const quiz of useQuizStore.getState().quizzes) {
      if (!quiz.folderId || !impact.ids.has(quiz.folderId)) continue;
      placements.set(quiz.folderId, [...(placements.get(quiz.folderId) ?? []), quiz.id]);
    }
    if (withDecks) {
      // Pachetele din folder (și din subfolderele lui) se șterg odată cu el; celelalte seturi merg la Neclasificate.
      const deckIds = useQuizStore.getState().quizzes
        .filter((quiz) => quiz.folderId && impact.ids.has(quiz.folderId) && isFlashcardDeck(quiz))
        .map((quiz) => quiz.id);
      if (deckIds.length > 0) useQuizStore.getState().bulkDeleteQuizzes(deckIds);
      store.deleteFolder(target.id);
      addToast(`Am șters folderul „${target.name}” și ${deckIds.length} ${deckIds.length === 1 ? 'pachet' : 'pachete'}.`, 'success', 5000);
      return;
    }
    // `deleteFolder` scoate folderul și urmașii lui și mută seturile din ei la Neclasificate (nu le șterge).
    const removed = store.deleteFolder(target.id);
    addToast(`Am șters folderul „${target.name}”.`, 'success', 8000, {
      label: 'Anulează',
      onClick: () => {
        useFolderStore.getState().restoreFolders(removed);
        for (const [folderId, ids] of placements) useQuizStore.getState().bulkMoveToFolder(ids, folderId);
      },
    });
  };

  return { folderToDelete, folderDeleteOpen, folderImpact, requestFolderDelete, closeFolderDelete, confirmFolderDelete };
}
