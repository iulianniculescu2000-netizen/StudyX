import { describe, expect, it } from 'vitest';
import type { Folder } from '../types';
import { buildGroupTree, foldersForHubScope, userFlashcardSpaceIds } from './flashcardGroups';

const folder = (id: string, name: string, parentId: string | null = null, scope?: 'flashcards'): Folder => (
  { id, name, emoji: '📁', color: 'blue', parentId, createdAt: 0, ...(scope ? { scope } : {}) } as Folder
);

const folders = [
  folder('rez', 'Rezidențiat'),
  folder('flash', 'Flashcarduri', 'rez'),
  folder('mine', 'Cardiologie', 'flash'),
  folder('sub', 'Aritmii', 'mine'),
  folder('kumar', 'Kumar', 'flash'),
  folder('grile', 'Grile', 'rez'),
  folder('plain', 'Facultate', null, 'flashcards'),
];

const flatten = (nodes: ReturnType<typeof buildGroupTree>): string[] => nodes.flatMap((node) => [node.id, ...flatten(node.children)]);

describe('folderele proprii din Rezidențiat › Flashcarduri', () => {
  it('recunoaște doar folderele făcute de utilizator, nu și pe cele ale aplicației', () => {
    expect([...userFlashcardSpaceIds(folders)].sort()).toEqual(['mine', 'sub']);
  });

  it('un folder gol al utilizatorului rămâne în arbore, împreună cu părinții lui', () => {
    const ids = flatten(buildGroupTree(folders, []));
    expect(ids).toEqual(expect.arrayContaining(['rez', 'flash', 'mine', 'sub']));
  });

  it('folderele goale ale aplicației (cărți, grile) rămân ascunse, iar folderul unui alt spațiu rămâne vizibil', () => {
    const ids = flatten(buildGroupTree(folders, []));
    expect(ids).not.toContain('kumar');
    expect(ids).not.toContain('grile');
    expect(ids).toContain('plain');
  });

  it('fără folderul „Flashcarduri” nu există spațiu propriu, iar un arbore gol nu inventează noduri', () => {
    expect(userFlashcardSpaceIds([folder('rez', 'Rezidențiat')]).size).toBe(0);
    expect(buildGroupTree([folder('rez', 'Rezidențiat'), folder('grile', 'Grile', 'rez')], [])).toEqual([]);
  });
});

describe('foldersForHubScope', () => {
  it('Rezidențiat vede doar arborele Rezidențiat, fără folderele hub-ului general', () => {
    const ids = foldersForHubScope(folders, [], true).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['rez', 'flash', 'mine', 'sub']));
    expect(ids).not.toContain('plain');
  });

  it('hub-ul general nu vede folderele Rezidențiat', () => {
    expect(foldersForHubScope(folders, [], false).map((f) => f.id)).toEqual(['plain']);
  });

  it('un folder din alt spațiu rămâne dacă ține un pachet afișat, cu părinții lui', () => {
    const nested = [...folders, folder('outer', 'Anul 1', null, 'flashcards'), folder('inner', 'Anatomie', 'outer', 'flashcards')];
    const ids = foldersForHubScope(nested, [{ quiz: { folderId: 'inner' } }], true).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['inner', 'outer']));
    expect(ids).not.toContain('plain');
  });
});
