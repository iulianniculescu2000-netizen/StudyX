import { describe, expect, it } from 'vitest';
import { useAIStore } from './aiStore';

describe('aiStore › booksOnly', () => {
  it('e oprit implicit și se schimbă prin setBooksOnly', () => {
    expect(useAIStore.getState().booksOnly).toBe(false);
    useAIStore.getState().setBooksOnly(true);
    expect(useAIStore.getState().booksOnly).toBe(true);
    useAIStore.getState().setBooksOnly(false);
    expect(useAIStore.getState().booksOnly).toBe(false);
  });
});
