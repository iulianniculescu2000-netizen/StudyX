import { describe, expect, it, vi } from 'vitest';
import type { AILibraryFolder, AIKnowledgeSource } from '../../store/aiStore';
import { filterByType, plainSearchText, readTimeoutMs, scopeVaultToGeneral, withStallGuard } from './helpers';

const folder = (id: string, name: string, parentId?: string) => ({ id, name, parentId, emoji: '📁' }) as unknown as AILibraryFolder;
const source = (id: string, extra: Partial<AIKnowledgeSource> = {}) =>
  ({ id, name: `${id}.pdf`, type: 'pdf', ...extra }) as unknown as AIKnowledgeSource;

describe('scopeVaultToGeneral (separarea Rezidențiat / Biblioteca AI)', () => {
  const folders = [
    folder('rez', 'Rezidențiat'),
    folder('rez-kumar', 'Kumar', 'rez'),
    folder('gen', 'Anatomie'),
    folder('gen-sub', 'Curs', 'gen'),
  ];
  const sources = [
    source('a', { folderId: 'rez-kumar' }),
    source('b', { folderId: 'rez' }),
    source('c', { folderId: 'gen-sub' }),
    source('d'),
  ];

  it('scoate folderele și cărțile Rezidențiat din biblioteca generală', () => {
    const scoped = scopeVaultToGeneral(folders, sources);
    expect(scoped.libraryFolders.map((f) => f.id)).toEqual(['gen', 'gen-sub']);
    expect(scoped.knowledgeSources.map((s) => s.id)).toEqual(['c', 'd']);
  });
});

describe('plainSearchText / filterByType', () => {
  it('ignoră diacriticele și majusculele', () => {
    expect(plainSearchText('  Rezidențiat ')).toBe('rezidentiat');
  });

  it('filtrează după tip și stare de indexare', () => {
    const list = [
      source('p'),
      source('i', { type: 'image' }),
      source('x', { indexStatus: 'indexing' }),
      source('e', { indexStatus: 'error' }),
    ];
    expect(filterByType(list, 'all')).toHaveLength(4);
    expect(filterByType(list, 'image').map((s) => s.id)).toEqual(['i']);
    expect(filterByType(list, 'pdf').map((s) => s.id)).toEqual(['p', 'x', 'e']);
    expect(filterByType(list, 'indexing').map((s) => s.id)).toEqual(['x', 'e']);
  });
});

describe('timeouturi la încărcare', () => {
  it('un PDF mare primește mai mult de 20 s (cauza „Importul PDF a expirat”)', () => {
    const kumar = readTimeoutMs(71 * 1024 * 1024, 'pdf');
    expect(kumar).toBeGreaterThan(200_000);
    expect(kumar).toBeLessThanOrEqual(330_000);
  });
  it('un PDF mic rămâne rezonabil, iar imaginile și textul au bugete proprii', () => {
    expect(readTimeoutMs(1024 * 1024, 'pdf')).toBe(48_000);
    expect(readTimeoutMs(5 * 1024 * 1024, 'image')).toBe(90_000);
    expect(readTimeoutMs(10_000, 'text')).toBe(30_000);
  });
});

describe('withStallGuard', () => {
  it('nu întrerupe o sarcină lungă care dă semne de viață', async () => {
    vi.useFakeTimers();
    const guarded = withStallGuard(async (touch) => {
      for (let i = 0; i < 5; i += 1) {
        await new Promise((r) => setTimeout(r, 80));
        touch();
      }
      return 'gata';
    }, 100, 'blocat');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(guarded).resolves.toBe('gata');
  });
  it('întrerupe o sarcină care nu mai dă semne de viață', async () => {
    vi.useFakeTimers();
    const guarded = withStallGuard(() => new Promise<string>(() => {}), 100, 'blocat');
    const assertion = expect(guarded).rejects.toThrow('blocat');
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
  });
});
