import { beforeEach, describe, expect, it } from 'vitest';
import { useNewFolderDialog } from './newFolderDialogStore';

describe('newFolderDialogStore', () => {
  beforeEach(() => useNewFolderDialog.getState().hide());

  it('se deschide implicit cu navigare la folderul nou (bara laterală, Bibliotecă)', () => {
    useNewFolderDialog.getState().show();
    expect(useNewFolderDialog.getState()).toMatchObject({ open: true, parentId: null, stay: false });
  });

  it('poate preseta părintele și poate cere să rămâi pe pagină (Flashcarduri)', () => {
    useNewFolderDialog.getState().show('f-1', { stay: true });
    expect(useNewFolderDialog.getState()).toMatchObject({ open: true, parentId: 'f-1', stay: true });
  });

  it('hide() readuce totul la implicit, ca un folder următor să nu moștenească „stay”', () => {
    useNewFolderDialog.getState().show('f-1', { stay: true });
    useNewFolderDialog.getState().hide();
    expect(useNewFolderDialog.getState()).toMatchObject({ open: false, parentId: null, stay: false });
    useNewFolderDialog.getState().show('f-2');
    expect(useNewFolderDialog.getState().stay).toBe(false);
  });
});
