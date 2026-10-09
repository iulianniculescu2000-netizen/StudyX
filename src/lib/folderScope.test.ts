import { beforeEach, describe, expect, it } from 'vitest';
import { migrateFlashcardFolderScopes, onlyFlashcardFolders, withoutFlashcardFolders } from './folderScope';
import type { Folder } from '../types';
import { useFolderStore } from '../store/folderStore';

describe('folder scope', () => {
  beforeEach(() => useFolderStore.setState({ folders: [] }));

  it('folderul creat din Flashcarduri primește scope, iar subfolderul îl moștenește', () => {
    const { addFolder } = useFolderStore.getState();
    const flash = addFolder('Carduri', '🃏', 'blue', null, 'flashcards');
    const sub = addFolder('Sub', '🃏', 'blue', flash);
    const grile = addFolder('Grile', '📘', 'blue');
    const folders = useFolderStore.getState().folders;
    expect(folders.find((f) => f.id === flash)?.scope).toBe('flashcards');
    expect(folders.find((f) => f.id === sub)?.scope).toBe('flashcards');
    expect(folders.find((f) => f.id === grile)?.scope).toBeUndefined();
    expect(withoutFlashcardFolders(folders).map((f) => f.id)).toEqual([grile]);
    expect(onlyFlashcardFolders(folders).map((f) => f.id).sort()).toEqual([flash, sub].sort());
  });
});

describe('migrateFlashcardFolderScopes', () => {
  const f = (id: string, parentId: string | null = null, name = id, scope?: 'flashcards'): Folder => ({
    id, name, emoji: '📁', color: 'blue', createdAt: 0, parentId, ...(scope ? { scope } : {}),
  });
  const deck = (folderId: string) => ({ folderId, kind: 'flashcard' as const, tags: [], questions: [] });
  const quiz = (folderId: string) => ({ folderId, kind: 'quiz' as const, tags: [], questions: [] });
  const scopes = (folders: Folder[]) => Object.fromEntries(folders.map((x) => [x.id, x.scope]));

  it('marchează folderul doar cu deckuri și descendenții lui (inclusiv cei goali)', () => {
    const folders = [f('a'), f('a1', 'a'), f('a2', 'a')];
    const out = migrateFlashcardFolderScopes(folders, [deck('a1')]);
    expect(scopes(out)).toEqual({ a: 'flashcards', a1: 'flashcards', a2: 'flashcards' });
  });

  it('nu atinge folderele goale sau mixte', () => {
    const folders = [f('empty'), f('mixed'), f('mixedSub', 'mixed')];
    const out = migrateFlashcardFolderScopes(folders, [deck('mixedSub'), quiz('mixed')]);
    expect(out).toBe(folders);
  });

  it('un subfolder doar cu deckuri sub un părinte mixt rămâne neatins', () => {
    const folders = [f('p'), f('c', 'p')];
    const out = migrateFlashcardFolderScopes(folders, [quiz('p'), deck('c')]);
    expect(out).toBe(folders);
  });

  it('ignoră arborele Rezidențiat', () => {
    const folders = [f('r', null, 'Rezidențiat'), f('d', 'r')];
    expect(migrateFlashcardFolderScopes(folders, [deck('d')])).toBe(folders);
  });

  it('un folder numit Rezidențiat dar nu rădăcină nu e ignorat', () => {
    const folders = [f('x'), f('r', 'x', 'Rezidențiat')];
    expect(scopes(migrateFlashcardFolderScopes(folders, [deck('r')]))).toEqual({ x: 'flashcards', r: 'flashcards' });
  });

  it('detectează deckuri vechi fără kind (după etichetă) și e idempotentă', () => {
    const folders = [f('a')];
    const quizzes = [{ folderId: 'a', tags: ['anki'], questions: [] }];
    const once = migrateFlashcardFolderScopes(folders, quizzes);
    expect(scopes(once)).toEqual({ a: 'flashcards' });
    expect(migrateFlashcardFolderScopes(once, quizzes)).toBe(once);
  });

  it('nu schimbă folderele cu scope existent', () => {
    const folders = [f('a', null, 'a', 'flashcards')];
    expect(migrateFlashcardFolderScopes(folders, [deck('a')])).toBe(folders);
  });
});
