import { create } from 'zustand';

interface RezidentiatFolderDialogState {
  open: boolean;
  /** Folderul în care se creează subfolderul; `null` = folderul de bază „Flashcarduri”. */
  parentId: string | null;
  show: (parentId?: string | null) => void;
  hide: () => void;
}

/**
 * Starea dialogului „Folder nou” din Rezidențiat › Flashcarduri. E în afara paginii ca butonul din antet, cel din
 * lista de pachete și acțiunea „Subfolder” de pe un folder să deschidă același dialog, fiecare cu părintele lui.
 */
export const useRezidentiatFolderDialog = create<RezidentiatFolderDialogState>((set) => ({
  open: false,
  parentId: null,
  show: (parentId = null) => set({ open: true, parentId }),
  hide: () => set({ open: false, parentId: null }),
}));
