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
  it('only clarifyGate is on by default', () => {
    const f = defaultHelperFlags();
    expect(f.clarifyGate).toBe(true);
    expect(f.queryRewrite).toBe(false);
    expect(Object.entries(f).filter(([, v]) => v).map(([k]) => k)).toEqual(['clarifyGate']);
  });
});

describe('resolveHelperFlags', () => {
  it('uses the defaults on empty or broken storage', () => {
    expect(resolveHelperFlags(memoryStorage())).toEqual(defaultHelperFlags());
    expect(resolveHelperFlags(memoryStorage('{oops'))).toEqual(defaultHelperFlags());
    expect(resolveHelperFlags(null)).toBeTruthy();
  });
  it('explicit values beat the defaults, both ways', () => {
    const s = memoryStorage(JSON.stringify({ queryRewrite: true, clarifyGate: false }));
    const f = resolveHelperFlags(s);
    expect(f.queryRewrite).toBe(true);
    expect(f.clarifyGate).toBe(false);
  });
  it('ignores non-boolean values', () => {
    const f = resolveHelperFlags(memoryStorage(JSON.stringify({ clarifyGate: 'no', queryRewrite: 1 })));
    expect(f).toEqual(defaultHelperFlags());
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
    expect(resolveHelperFlags(bad).clarifyGate).toBe(true);
  });
});
