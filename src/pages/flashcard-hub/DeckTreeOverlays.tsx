import { AnimatePresence } from 'framer-motion';
import type { RefObject } from 'react';
import type { Folder, Quiz } from '../../types';
import type { Theme } from '../../theme/themes';
import ConfirmDialog from '../../components/ConfirmDialog';
import ModalShell from '../../components/ui/ModalShell';
import Portal from '../../components/Portal';
import type { folderDeleteImpact } from '../../lib/flashcardGroups';
import { EditDeckModal, type FlashcardDeckSummary } from './sections';
import MoveMenu from './MoveMenu';
import HelpTip from '../../components/ui/HelpTip';
import { describeFolderDelete } from './deckTreeShared';

interface DeckTreeOverlaysProps {
  theme: Theme;
  residencyPage: boolean;
  decks: FlashcardDeckSummary[];
  folders: Folder[];
  moveFolders: Folder[];
  editingDeck: Quiz | null;
  onCloseEdit: () => void;
  deckToDelete: Quiz | null;
  deckDeleteOpen: boolean;
  onConfirmDeckDelete: () => void;
  onCloseDeckDelete: () => void;
  folderToDelete: Folder | null;
  folderDeleteOpen: boolean;
  folderImpact: ReturnType<typeof folderDeleteImpact> | null;
  onConfirmFolderDelete: (withDecks?: boolean) => void;
  onCloseFolderDelete: () => void;
  movingId: string | null;
  moveAnchor: RefObject<HTMLElement | null>;
  onCloseMove: () => void;
  onPickMove: (quizId: string, folderId: string | null) => void;
}

/** Ferestrele și meniurile deasupra listei: editare pachet, ștergere pachet/folder, „Mută în…”. */
export function DeckTreeOverlays({
  theme, residencyPage, decks, folders, moveFolders, editingDeck, onCloseEdit,
  deckToDelete, deckDeleteOpen, onConfirmDeckDelete, onCloseDeckDelete,
  folderToDelete, folderDeleteOpen, folderImpact, onConfirmFolderDelete, onCloseFolderDelete,
  movingId, moveAnchor, onCloseMove, onPickMove,
}: DeckTreeOverlaysProps) {
  return (
    <>
      <Portal>
        <AnimatePresence>
          {editingDeck && <EditDeckModal quiz={editingDeck} theme={theme} onClose={onCloseEdit} />}
        </AnimatePresence>
      </Portal>
      <ConfirmDialog
        open={deckDeleteOpen}
        title={`Ștergi pachetul „${deckToDelete?.title ?? ''}"?`}
        description={`Cele ${deckToDelete?.questions.length ?? 0} carduri din pachet dispar. Acțiunea nu poate fi anulată.`}
        confirmLabel="Șterge pachetul"
        cancelLabel="Anulează"
        variant="danger"
        onConfirm={onConfirmDeckDelete}
        onCancel={onCloseDeckDelete}
      />
      {residencyPage && (folderImpact?.decks ?? 0) > 0 ? (
        <ModalShell
          open={folderDeleteOpen}
          title={`Ștergi folderul „${folderToDelete?.name ?? ''}”?`}
          subtitle={describeFolderDelete(folderImpact)}
          onClose={onCloseFolderDelete}
          width="sm"
          footer={(
            <div className="flex w-full flex-col gap-2">
              <button type="button" onClick={() => onConfirmFolderDelete(false)} className="press-feedback rounded-full px-4 py-2.5 text-[13px] font-semibold" style={{ background: theme.surface2, color: theme.text }}>
                Șterge doar folderul, păstrează pachetele
              </button>
              <button type="button" onClick={() => onConfirmFolderDelete(true)} className="press-feedback rounded-full px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: theme.danger }}>
                Șterge folderul și pachetele
              </button>
              <div className="flex items-center justify-center gap-2">
                <button type="button" onClick={onCloseFolderDelete} className="press-feedback rounded-full px-4 py-2 text-[12.5px] font-semibold" style={{ color: theme.text3 }}>
                  Anulează
                </button>
                <HelpTip id="fc-delete-folder" placement="top" />
              </div>
            </div>
          )}
        >
          <p className="text-[12.5px] leading-relaxed" style={{ color: theme.text3 }}>
            Dacă ștergi și pachetele, cardurile lor dispar definitiv; dacă le păstrezi, rămân la „Neclasificate”.
          </p>
        </ModalShell>
      ) : (
        <ConfirmDialog
          open={folderDeleteOpen}
          title={`Ștergi folderul „${folderToDelete?.name ?? ''}"?`}
          description={describeFolderDelete(folderImpact)}
          confirmLabel="Șterge folderul"
          cancelLabel="Anulează"
          variant="danger"
          onConfirm={() => onConfirmFolderDelete(false)}
          onCancel={onCloseFolderDelete}
        />
      )}
      {movingId && (() => {
        const quiz = decks.find((deck) => deck.quiz.id === movingId)?.quiz;
        if (!quiz) return null;
        const current = quiz.folderId && folders.some((folder) => folder.id === quiz.folderId) ? quiz.folderId : null;
        return (
          <MoveMenu
            folders={moveFolders}
            currentFolderId={current}
            anchorRef={moveAnchor}
            onClose={onCloseMove}
            onPick={(folderId) => onPickMove(movingId, folderId)}
          />
        );
      })()}
    </>
  );
}
