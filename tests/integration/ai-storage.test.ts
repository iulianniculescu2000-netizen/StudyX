import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chunkDocument } from '../../src/ai/chunker';
import { addChunksToVault, clearVault, removeChunksBySource } from '../../src/ai/vectorStore';
import { retrieveRelevantChunks } from '../../src/ai/retriever';
import { useAIStore } from '../../src/store/aiStore';

vi.mock('../../src/ai/chunker', () => ({
  chunkDocument: vi.fn(),
}));

vi.mock('../../src/ai/vectorStore', () => ({
  addChunksToVault: vi.fn(),
  clearVault: vi.fn(),
  removeChunksBySource: vi.fn(),
  searchVault: vi.fn(),
}));

// getKnowledgeContext asks the hybrid retriever (same path as the chat), not the raw vault search.
vi.mock('../../src/ai/retriever', () => ({
  retrieveRelevantChunks: vi.fn(),
}));

const mockedRetrieve = vi.mocked(retrieveRelevantChunks);
const mockedChunkDocument = vi.mocked(chunkDocument);
const mockedAddChunksToVault = vi.mocked(addChunksToVault);
const mockedClearVault = vi.mocked(clearVault);
const mockedRemoveChunksBySource = vi.mocked(removeChunksBySource);

describe('AI store integration', () => {
  beforeEach(() => {
    useAIStore.getState().reset();
    vi.clearAllMocks();
  });

  it('normalizes API key state without leaking invalid keys as active AI', () => {
    useAIStore.getState().setApiKey('not-a-real-key');
    expect(useAIStore.getState().hasKey).toBe(false);

    useAIStore.getState().setApiKey('  gsk_1234567890123456789012345  ');

    expect(useAIStore.getState().apiKey).toBe('gsk_1234567890123456789012345');
    expect(useAIStore.getState().hasKey).toBe(true);
  });

  it('switches provider and validates Google keys independently from Groq keys', () => {
    useAIStore.getState().setApiKey('gsk_1234567890123456789012345');
    expect(useAIStore.getState().provider).toBe('groq');
    expect(useAIStore.getState().hasKey).toBe(true);

    useAIStore.getState().setProvider('google');

    expect(useAIStore.getState().provider).toBe('google');
    expect(useAIStore.getState().model).toBe('gemini-3.8-flash');
    expect(useAIStore.getState().hasKey).toBe(false);

    // Wrong prefix for Google → invalid.
    useAIStore.getState().setApiKey('gsk_1234567890123456789012345');
    expect(useAIStore.getState().hasKey).toBe(false);

    // Valid Google (Gemini) key format.
    useAIStore.getState().setApiKey('AIzaSy1234567890123456789012345678901');
    expect(useAIStore.getState().hasKey).toBe(true);
  });

  it('adds and indexes a knowledge source with progress reflected in store state', async () => {
    const progressSpy = vi.fn();
    mockedChunkDocument.mockResolvedValue([
      { id: 'chunk-1', text: 'mecanism fiziopatologic' },
      { id: 'chunk-2', text: 'diagnostic si tratament' },
    ]);
    mockedAddChunksToVault.mockImplementation(async (_chunks, _name, _sourceId, options) => {
      options.onProgress?.({ processed: 1, total: 2, percent: 50 });
      options.onProgress?.({ processed: 2, total: 2, percent: 100 });
      return 2;
    });

    const source = await useAIStore.getState().addKnowledgeSource(
      'Curs cardio',
      'Insuficienta cardiaca apare prin scaderea debitului cardiac si activare neurohormonala.',
      'txt',
      { onIndexProgress: progressSpy },
    );

    expect(mockedChunkDocument).toHaveBeenCalledWith(expect.any(String), 'Curs cardio', expect.any(Object));
    expect(mockedAddChunksToVault).toHaveBeenCalledWith(expect.any(Array), 'Curs cardio', source.id, expect.any(Object));
    expect(progressSpy).toHaveBeenLastCalledWith({ processed: 2, total: 2, percent: 100 });
    expect(source.indexStatus).toBe('ready');
    expect(source.chunkCount).toBe(2);
    expect(useAIStore.getState().knowledgeSources[0]).toMatchObject({
      id: source.id,
      name: 'Curs cardio',
      indexStatus: 'ready',
      indexProgress: 100,
    });
    expect(useAIStore.getState().cache.size).toBe(2);
  });

  it('marks a source as errored when indexing fails and preserves the error message', async () => {
    mockedChunkDocument.mockRejectedValue(new Error('PDF ilizibil'));

    await expect(
      useAIStore.getState().addKnowledgeSource('Curs imposibil', 'text valid pentru incercare'),
    ).rejects.toThrow('PDF ilizibil');

    expect(useAIStore.getState().knowledgeSources[0]).toMatchObject({
      name: 'Curs imposibil',
      indexStatus: 'error',
      indexError: 'PDF ilizibil',
      indexProgress: 0,
    });
  });

  it('builds grounded context only from ready sources and respects the character budget', async () => {
    useAIStore.setState({
      knowledgeSources: [
        {
          id: 'ready-source',
          name: 'Curs ready',
          type: 'txt',
          preview: 'preview',
          charCount: 100,
          wordCount: 15,
          chunkCount: 1,
          qualityScore: 80,
          addedAt: Date.now(),
          indexStatus: 'ready',
          indexProgress: 100,
        },
      ],
    });
    mockedRetrieve.mockResolvedValue([
      {
        id: 'chunk-1',
        sourceId: 'ready-source',
        text: 'Fragment clinic relevant despre edem pulmonar acut.',
        source: 'Curs ready',
        topic: 'cardio',
        difficulty: 'medium',
        score: 0.9,
        keywordScore: 0.9,
        semanticScore: 0.5,
        recencyBoost: 0,
        weaknessBoost: 0,
      },
    ]);

    const context = await useAIStore.getState().getKnowledgeContext('edem pulmonar', 400);

    expect(mockedRetrieve).toHaveBeenCalled();
    expect(mockedRetrieve.mock.calls[0][3]?.excludeSourceIds ?? []).not.toContain('ready-source');
    expect(context).toContain('Curs ready');
    expect(context).toContain('[1]');
    expect(context.length).toBeLessThanOrEqual(400);

    const tight = await useAIStore.getState().getKnowledgeContext('edem pulmonar', 80);
    expect(tight.length).toBeLessThanOrEqual(80);
  });

  it('removes indexed sources and recomputes cache size', async () => {
    useAIStore.setState({
      knowledgeSources: [
        {
          id: 'source-1',
          name: 'Curs 1',
          type: 'txt',
          preview: '',
          charCount: 10,
          wordCount: 2,
          chunkCount: 3,
          qualityScore: 60,
          addedAt: Date.now(),
          indexStatus: 'ready',
          indexProgress: 100,
        },
      ],
      cache: { size: 3, lastCleared: null },
    });

    await useAIStore.getState().removeKnowledgeSource('source-1');

    expect(mockedRemoveChunksBySource).toHaveBeenCalledWith('source-1');
    expect(useAIStore.getState().knowledgeSources).toHaveLength(0);
    expect(useAIStore.getState().cache.size).toBe(0);
  });

  it('clears volatile and persisted AI state through reset', () => {
    useAIStore.setState({
      apiKey: 'gsk_1234567890123456789012345',
      hasKey: true,
      knowledgeSources: [
        {
          id: 'source-1',
          name: 'Curs 1',
          type: 'txt',
          preview: '',
          charCount: 10,
          wordCount: 2,
          chunkCount: 1,
          qualityScore: 60,
          addedAt: Date.now(),
          indexStatus: 'ready',
          indexProgress: 100,
        },
      ],
    });

    useAIStore.getState().reset();

    expect(mockedClearVault).toHaveBeenCalled();
    expect(useAIStore.getState().hasKey).toBe(false);
    expect(useAIStore.getState().apiKey).toBe('');
    expect(useAIStore.getState().knowledgeSources).toHaveLength(0);
    expect(useAIStore.getState().isHydrated).toBe(true);
  });
});
