import { useState } from 'react';
import type { DragEvent } from 'react';
import type { Quiz } from '../../types';
import { QUIZ_DRAG_MIME } from './constants';

interface Options {
  quizzes: Quiz[];
  folders: Array<{ id: string; name: string }>;
  moveToFolder: (quizId: string, folderId: string | null) => void;
  addToast: (message: string, type: 'info' | 'success', duration: number) => void;
}

/** Drag a quiz onto a sidebar folder (or "Neclasificate") to move it. */
export function useFolderDragDrop({ quizzes, folders, moveToFolder, addToast }: Options) {
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const getDraggedQuizId = (event: DragEvent<HTMLElement>) => (
    event.dataTransfer.getData(QUIZ_DRAG_MIME) || event.dataTransfer.getData('text/plain')
  );

  const isQuizDrag = (event: DragEvent<HTMLElement>) => (
    Array.from(event.dataTransfer.types).includes(QUIZ_DRAG_MIME)
  );

  const handleFolderDragOver = (event: DragEvent<HTMLElement>, targetFolderId: string | null) => {
    if (!isQuizDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetId(targetFolderId ?? '__uncategorized__');
  };

  const handleFolderDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!isQuizDrag(event)) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDropTargetId(null);
  };

  const handleFolderDrop = (event: DragEvent<HTMLElement>, targetFolderId: string | null) => {
    if (!isQuizDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTargetId(null);

    const quizId = getDraggedQuizId(event);
    const quiz = quizzes.find((item) => item.id === quizId);
    if (!quiz) return;

    const nextFolderId = targetFolderId ?? null;
    if ((quiz.folderId ?? null) === nextFolderId) {
      addToast('Grila este deja în folderul ales.', 'info', 2200);
      return;
    }

    moveToFolder(quiz.id, nextFolderId);
    const folderName = nextFolderId
      ? folders.find((folder) => folder.id === nextFolderId)?.name ?? 'folder'
      : 'Neclasificate';
    addToast(`Am mutat "${quiz.title}" in ${folderName}.`, 'success', 2600);
  };

  return { dropTargetId, handleFolderDragOver, handleFolderDragLeave, handleFolderDrop };
}
