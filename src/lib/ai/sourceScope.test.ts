import { describe, expect, it } from 'vitest';
import type { AILibraryFolder } from '../../store/aiStore';
import { filterSourcesByScope, retrievalFiltersForScope, rezidentiatFolderIds } from './sourceScope';

const folder = (id: string, name: string, parentId: string | null = null): AILibraryFolder => ({ id, name, emoji: '📁', parentId, createdAt: 0 });
const folders = [folder('rez', 'Rezidențiat'), folder('cap', 'Capitole', 'rez'), folder('disc', 'ATI', 'cap'), folder('mine', 'Cursurile mele')];
const source = (id: string, folderId: string | null) => ({ id, folderId });
const sources = [source('kumar', 'rez'), source('ati', 'disc'), source('curs', 'mine'), source('liber', null)];

describe('sourceScope', () => {
  it('recunoaște rădăcina Rezidențiat și tot ce e sub ea', () => {
    expect([...rezidentiatFolderIds(folders)].sort()).toEqual(['cap', 'disc', 'rez']);
  });

  it('chatul general nu vede cărțile de rezidențiat, iar rezidențiatul vede doar ce e al lui', () => {
    expect(filterSourcesByScope(sources, folders, 'general').map((s) => s.id)).toEqual(['curs', 'liber']);
    expect(filterSourcesByScope(sources, folders, 'rezidentiat').map((s) => s.id)).toEqual(['kumar', 'ati']);
  });

  it('filtrele de căutare țin fiecare căutare în spațiul ei', () => {
    expect(retrievalFiltersForScope(sources, folders, 'general')).toEqual({ excludeSourceIds: ['kumar', 'ati'] });
    expect(retrievalFiltersForScope(sources, folders, 'rezidentiat')).toEqual({ sourceIds: ['kumar', 'ati'], rezidentiat: true });
  });

  it('chatul general poate căuta și în cele trei cărți de bază; materialele din Rezidențiat rămân acolo', () => {
    const withNames = [
      { id: 'kumar', folderId: 'rez', name: 'Kumar și Clark – Medicină Clinică.pdf' },
      { id: 'ati', folderId: 'disc', name: 'Curs ATI.pdf' },
      { id: 'curs', folderId: 'mine', name: 'Cursul meu.pdf' },
    ];
    expect(retrievalFiltersForScope(withNames, folders, 'general', { includeBaseBooks: true })).toEqual({ excludeSourceIds: ['ati'] });
    expect(retrievalFiltersForScope(withNames, folders, 'general')).toEqual({ excludeSourceIds: ['kumar', 'ati'] });
  });

  it('fără cărți de rezidențiat: general caută în tot, iar rezidențiatul nu caută nimic', () => {
    const own = [source('curs', 'mine')];
    expect(retrievalFiltersForScope(own, folders, 'general')).toEqual({});
    expect(retrievalFiltersForScope(own, folders, 'rezidentiat')).toBeNull();
  });
});
