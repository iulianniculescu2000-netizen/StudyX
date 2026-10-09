import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useFolderStore } from '../../store/folderStore';
import { useNewFolderDialog } from '../../store/newFolderDialogStore';
import { onlyFlashcardFolders, withoutFlashcardFolders } from '../../lib/folderScope';
import type { QuizColor } from '../../types';
import Portal from '../Portal';
import NewFolderModal from './NewFolderModal';

/**
 * Owns the "Folder nou" dialog end to end, subscribed only to its own tiny
 * store, so opening it never re-renders the Sidebar itself.
 */
export default function NewFolderDialogHost() {
  const open = useNewFolderDialog((state) => state.open);
  const parentId = useNewFolderDialog((state) => state.parentId);
  const scope = useNewFolderDialog((state) => state.scope);
  const hide = useNewFolderDialog((state) => state.hide);
  const folders = useFolderStore((state) => state.folders);
  const addFolder = useFolderStore((state) => state.addFolder);
  const navigate = useNavigate();

  const handleCreate = (name: string, emoji: string, color: QuizColor, targetParentId?: string | null) => {
    const { stay, scope } = useNewFolderDialog.getState();
    const id = addFolder(name, emoji, color, targetParentId, scope);
    hide();
    if (!stay) navigate(`/folder/${id}`);
  };

  return (
    <Portal>
      <AnimatePresence>
        {open && <NewFolderModal folders={scope ? onlyFlashcardFolders(folders) : withoutFlashcardFolders(folders)} initialParentId={parentId} onClose={hide} onAdd={handleCreate} />}
      </AnimatePresence>
    </Portal>
  );
}
