import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from './userStore';
import { useAIStore, normalizeStudyMemory } from './aiStore';
import { loadMemories, saveMemories } from '../ai/chatMemory';

vi.mock('../ai/vectorStore', async (orig) => ({ ...(await orig<object>()), clearVault: vi.fn() }));

const lsKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string);

describe('persisted-blob safety (user + ai stores)', () => {
  beforeEach(() => localStorage.clear());

  it('userStore: a corrupt blob is quarantined, not silently overwritten', async () => {
    localStorage.setItem('studyx-user', '{"state":{"profiles":[{"id":"a"');
    await useUserStore.persist.rehydrate();
    expect(useUserStore.getState().profiles).toEqual([]);
    const keys = lsKeys().filter((k) => k.startsWith('studyx-user__corrupt-'));
    expect(keys).toHaveLength(1);
    expect(localStorage.getItem(keys[0])).toContain('"id":"a"');
  });

  it('userStore: old single-user format gets a stable id that is persisted immediately', async () => {
    localStorage.setItem('studyx-user', JSON.stringify({ version: 4, state: { username: 'Ana' } }));
    await useUserStore.persist.rehydrate();
    await Promise.resolve();
    const id = useUserStore.getState().activeProfileId;
    expect(id).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem('studyx-user') ?? '{}');
    expect(saved.state.activeProfileId).toBe(id);
    expect(saved.state.profiles[0].id).toBe(id);
    await useUserStore.persist.rehydrate(); // next "launch": same id, no new profile
    expect(useUserStore.getState().activeProfileId).toBe(id);
    expect(useUserStore.getState().profiles).toHaveLength(1);
  });

  it('userStore migrate: tolerates profiles that are not an array', () => {
    const migrate = useUserStore.persist.getOptions().migrate!;
    expect(migrate({ profiles: 'oops', activeProfileId: 'x' }, 3)).toMatchObject({ profiles: [], activeProfileId: 'x' });
    expect(migrate({ profiles: [null, { id: 'p', username: 'A', gradient: 'g', createdAt: 1, themeId: 't' }] }, 3))
      .toMatchObject({ profiles: [{ id: 'p', username: 'A', gradient: 'g', createdAt: 1 }] });
  });

  it('aiStore: Cerebras migration keeps other keys, falls back to a provider with a key', async () => {
    localStorage.setItem('ai-store', JSON.stringify({
      version: 0,
      state: {
        provider: 'cerebras', apiKey: 'csk-old', model: 'llama3.1-8b', hasKey: true,
        providerKeys: { cerebras: 'csk-old', google: 'AIza_abcdefghijklmnopqrstuvwxyz' },
        providerModels: { cerebras: 'llama3.1-8b', google: 'gemini-3.6-flash' },
        studyMemory: { p1: { interactions: 7 } },
      },
    }));
    await useAIStore.persist.rehydrate();
    const s = useAIStore.getState();
    expect(s.provider).toBe('google');
    expect(s.providerKeys).toEqual({ google: 'AIza_abcdefghijklmnopqrstuvwxyz' });
    expect(s.providerModels).toEqual({ google: 'gemini-3.6-flash' });
    expect(s.apiKey).toBe('AIza_abcdefghijklmnopqrstuvwxyz');
    expect(s.hasKey).toBe(true);
    expect(s.studyMemory.p1.interactions).toBe(7);
    expect(s.studyMemory.p1.signals.likesTests).toBe(0);
  });

  it('aiStore: rehydrates from a blob without `cache`, and with a corrupt blob it quarantines', async () => {
    localStorage.setItem('ai-store', JSON.stringify({ version: 0, state: { provider: 'groq', providerKeys: {} } }));
    await useAIStore.persist.rehydrate();
    expect(useAIStore.getState().cache).toEqual({ size: 0, lastCleared: null });

    localStorage.setItem('ai-store', 'not json{{');
    await useAIStore.persist.rehydrate();
    expect(lsKeys().some((k) => k.startsWith('ai-store__corrupt-'))).toBe(true);
  });

  it('recordAIInteraction counts on top of a repaired legacy memory (no throw, no reset)', () => {
    useAIStore.setState({ studyMemory: normalizeStudyMemory({ p1: { interactions: 4, signals: null, modeUsage: { explain: 2 } } }) });
    useAIStore.getState().recordAIInteraction('p1', { mode: 'explain', prompt: 'explica mecanismul' });
    const m = useAIStore.getState().studyMemory.p1;
    expect(m.interactions).toBe(5);
    expect(m.modeUsage.explain).toBe(3);
    expect(useAIStore.getState().getAIMemoryContext('p1')).toContain('5 interacțiuni');
  });

  it('normalizeStudyMemory drops non-object entries and negative/NaN counters', () => {
    const out = normalizeStudyMemory({ a: 5, b: { interactions: -3, modeUsage: { x: NaN, y: 2 } } });
    expect(Object.keys(out)).toEqual(['b']);
    expect(out.b.interactions).toBe(0);
    expect(out.b.modeUsage).toEqual({ x: 0, y: 2 });
  });
});

describe('chatMemory corrupt blob', () => {
  beforeEach(() => localStorage.clear());
  it('keeps one backup of an unreadable memory list instead of letting the next save erase it', () => {
    localStorage.setItem('studyx-chat-memory-p', '[{"id":"m1"');
    expect(loadMemories('p')).toEqual([]);
    expect(loadMemories('p')).toEqual([]);
    expect(localStorage.getItem('studyx-chat-memory-p__corrupt')).toBe('[{"id":"m1"');
    saveMemories('p', []);
    expect(localStorage.getItem('studyx-chat-memory-p__corrupt')).toBe('[{"id":"m1"');
  });
});
