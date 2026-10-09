import { useQuizStore } from '../../../../store/quizStore';
import { useFolderStore } from '../../../../store/folderStore';
import { useAIStore } from '../../../../store/aiStore';
import { suggestFolderAppearance } from '../../../folderAppearance';
import { type Folder } from '../../../../types';
import { findByName, normalizeName } from '../shared';
import { type StepEnv } from './env';

export async function runCreateFolder(env: StepEnv): Promise<void> {
  const { step, index, callbacks, folderStore, createdFolderByName, undoOps, summaryParts, resolveQuizFolder, defaultParentFolder } = env;
    if (!step.name) throw new Error('Lipsește numele folderului.');
    const parent = step.parent ? resolveQuizFolder(step.parent) : defaultParentFolder();
    // Reuse an existing folder with this name UNDER THE SAME PARENT,
    // instead of creating a duplicate — but resolveQuizFolder matches
    // by name GLOBALLY (any folder in the whole tree), so without also
    // checking the parent, asking for "un folder arsuri în Rezidențiat"
    // could silently "succeed" by reusing an unrelated "arsuri" folder
    // sitting somewhere completely different (root, another
    // discipline, a leftover from a past session) — the UI says
    // "Folder existent, reutilizat" and the step shows done, but no
    // folder ever appears where the user is actually looking. Confirmed
    // live: exactly this happened. Only treat it as "the same folder"
    // when the parent matches too (both null = both at root).
    const nameMatch = resolveQuizFolder(step.name);
    const existing = nameMatch && (nameMatch.parentId ?? null) === (parent?.id ?? null) ? nameMatch : null;
    if (existing) {
      callbacks.onStep(index, 'done', 'Folder existent, reutilizat');
      return;
    }
    // Used to fall back to a generic 📁 for any subfolder, discarding
    // the topical suggestion right below it — "Arsuri" created under
    // "Rezidențiat" got a plain folder icon instead of anything
    // relevant, while a root-level folder with the same name would
    // have gotten a proper one. Nesting isn't a reason to be generic.
    const { emoji, color } = suggestFolderAppearance(step.name);
    const id = folderStore.addFolder(step.name, emoji, color, parent?.id ?? null);
    const folder: Folder = { id, name: step.name, emoji, color, parentId: parent?.id ?? null, createdAt: Date.now() };
    createdFolderByName.set(normalizeName(step.name), folder);
    undoOps.push(() => useFolderStore.getState().deleteFolder(id));
    summaryParts.push(`folder „${step.name}"`);
    callbacks.onStep(index, 'done');
    return;
}

export async function runCreateLibraryFolder(env: StepEnv): Promise<void> {
  const { step, index, callbacks, aiStore, undoOps, summaryParts, defaultLibraryParent } = env;
    if (!step.name) throw new Error('Lipsește numele folderului.');
    const parent = step.parent ? findByName(useAIStore.getState().libraryFolders, step.parent) : defaultLibraryParent();
    const libraryEmoji = parent ? suggestFolderAppearance(step.name).emoji : '📚';
    const id = aiStore.addLibraryFolder(step.name, libraryEmoji, parent?.id ?? null);
    undoOps.push(() => useAIStore.getState().deleteLibraryFolder(id));
    summaryParts.push(parent ? `subfolder bibliotecă „${step.name}" în „${parent.name}"` : `folder bibliotecă „${step.name}"`);
    callbacks.onStep(index, 'done');
    return;
}

export async function runRenameFolder(env: StepEnv): Promise<void> {
  const { step, index, callbacks, undoOps, summaryParts } = env;
    const folder = findByName(useFolderStore.getState().folders, step.name);
    if (!folder || !step.newName) throw new Error(`Nu am putut redenumi folderul „${step.name ?? '?'}".`);
    const previous = folder.name;
    useFolderStore.getState().updateFolder(folder.id, { name: step.newName });
    undoOps.push(() => useFolderStore.getState().updateFolder(folder.id, { name: previous }));
    summaryParts.push(`folder redenumit „${step.newName}"`);
    callbacks.onStep(index, 'done');
    return;
}

export async function runDeleteFolder(env: StepEnv): Promise<void> {
  const { step, index, callbacks, undoOps, summaryParts } = env;
    const folder = findByName(useFolderStore.getState().folders, step.name);
    if (!folder) throw new Error(`Nu am găsit folderul „${step.name ?? '?'}".`);
    // Remember where every affected quiz lived. Undo used to call
    // addFolder, which mints a NEW id, so the folder came back empty and
    // the quizzes stayed detached — an unrecoverable loss of structure.
    const affected = useQuizStore.getState().quizzes
      .filter((quiz): quiz is typeof quiz & { folderId: string } => !!quiz.folderId)
      .map((quiz) => ({ id: quiz.id, folderId: quiz.folderId }));
    const removedFolders = useFolderStore.getState().deleteFolder(folder.id);
    const removedIds = new Set(removedFolders.map((entry) => entry.id));
    const detached = affected.filter((entry) => removedIds.has(entry.folderId));

    undoOps.push(() => {
      useFolderStore.getState().restoreFolders(removedFolders);
      detached.forEach((entry) => useQuizStore.getState().moveToFolder(entry.id, entry.folderId));
    });
    summaryParts.push(`folder șters „${folder.name}"`);
    callbacks.onStep(index, 'done');
    return;
}
