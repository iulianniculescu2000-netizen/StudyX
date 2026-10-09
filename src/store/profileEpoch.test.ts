import { describe, expect, it, vi } from 'vitest';
import { bumpProfileEpoch, ProfileChangedError, profileGuard } from './profileEpoch';

describe('profileGuard', () => {
  it('passes while the profile is the same', () => {
    const assertSame = profileGuard();
    expect(() => assertSame()).not.toThrow();
  });

  it('throws once any profile has been loaded since, even if it is the same id again (A → B → A)', () => {
    const assertSame = profileGuard();
    bumpProfileEpoch();
    bumpProfileEpoch();
    expect(() => assertSame()).toThrow(ProfileChangedError);
  });
});

describe('interrupted indexing is reconciled on load', () => {
  it('marks a source ready when its chunks exist, error when they do not, and leaves in-flight work alone', async () => {
    vi.resetModules();
    vi.doMock('../ai/vectorStore', () => ({
      addChunksToVault: vi.fn(),
      clearVault: vi.fn(),
      removeChunksBySource: vi.fn(),
      searchVault: vi.fn(),
      getVaultChunksBySource: async (id: string) => (id === 'has-chunks' ? [{ id: 'c' }] : []),
    }));
    const { useAIStore } = await import('./aiStore');
    const base = { type: 'pdf', preview: '', charCount: 1, wordCount: 1, chunkCount: 0, qualityScore: 1, addedAt: 1, indexProgress: 40 } as const;
    useAIStore.getState()._hydrate({
      libraryFolders: [],
      knowledgeSources: [
        { ...base, id: 'has-chunks', name: 'a.pdf', indexStatus: 'indexing' },
        { ...base, id: 'no-chunks', name: 'b.pdf', indexStatus: 'indexing' },
        { ...base, id: 'done', name: 'c.pdf', indexStatus: 'ready' },
      ],
    });

    await useAIStore.getState().reconcileInterruptedIndexing();

    const byId = Object.fromEntries(useAIStore.getState().knowledgeSources.map((source) => [source.id, source]));
    expect(byId['has-chunks'].indexStatus).toBe('ready');
    expect(byId['has-chunks'].chunkCount).toBe(1);
    expect(byId['no-chunks'].indexStatus).toBe('error');
    expect(byId['no-chunks'].indexError).toMatch(/întreruptă/);
    expect(byId['done'].indexStatus).toBe('ready');
    vi.doUnmock('../ai/vectorStore');
  });
});
