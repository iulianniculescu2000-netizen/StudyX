import { describe, expect, it } from 'vitest';
import { defaultHelperFlags, resolveHelperFlags, writeHelperFlag } from './helperSettings';
import { HELPER_FLAGS_STORAGE_KEY } from './shared';

function memoryStorage(initial?: string) {
  let value: string | null = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => { value = v; },
    peek: () => value,
  };
}

describe('defaultHelperFlags', () => {
  it('without local: only clarifyGate is on', () => {
    const f = defaultHelperFlags(false);
    expect(f.clarifyGate).toBe(true);
    expect(f.queryRewrite).toBe(false);
    expect(f.answerChecklist).toBe(false);
    expect(Object.entries(f).filter(([, v]) => v).map(([k]) => k)).toEqual(['clarifyGate']);
  });
  it('with local: queryRewrite, answerChecklist and clarifyGate; the rest off', () => {
    const f = defaultHelperFlags(true);
    expect(Object.entries(f).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(['answerChecklist', 'clarifyGate', 'queryRewrite']);
  });
});

describe('resolveHelperFlags', () => {
  it('uses the defaults on empty or broken storage', () => {
    expect(resolveHelperFlags(true, memoryStorage())).toEqual(defaultHelperFlags(true));
    expect(resolveHelperFlags(true, memoryStorage('{oops'))).toEqual(defaultHelperFlags(true));
    expect(resolveHelperFlags(false, null)).toBeTruthy();
  });
  it('explicit values beat the defaults, both ways', () => {
    const s = memoryStorage(JSON.stringify({ queryRewrite: false, clarifyGate: false, selfCritique: true, answerChecklist: 'yes' }));
    const f = resolveHelperFlags(true, s);
    expect(f.queryRewrite).toBe(false);
    expect(f.clarifyGate).toBe(false);
    expect(f.selfCritique).toBe(true);
    expect(f.answerChecklist).toBe(true); // non-boolean ignored -> default for local
  });
});

describe('writeHelperFlag', () => {
  it('keeps earlier explicit choices', () => {
    const s = memoryStorage();
    writeHelperFlag('queryRewrite', false, s);
    writeHelperFlag('clarifyGate', false, s);
    expect(JSON.parse(s.peek()!)).toEqual({ queryRewrite: false, clarifyGate: false });
    expect(HELPER_FLAGS_STORAGE_KEY).toBe('studyx.aiHelpers');
  });
  it('does not throw when storage fails', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(() => writeHelperFlag('clarifyGate', true, bad)).not.toThrow();
    expect(resolveHelperFlags(false, bad).clarifyGate).toBe(true);
  });
});
