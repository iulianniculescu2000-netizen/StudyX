import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useQuizStore } from '../store/quizStore';
import { useStoresHydrated } from './useStoresHydrated';

describe('useStoresHydrated', () => {
  afterEach(() => act(() => useQuizStore.setState({ _hasHydrated: true })));

  it('trece din false în true când quizStore se hidratează', () => {
    act(() => useQuizStore.setState({ _hasHydrated: false }));
    const { result } = renderHook(() => useStoresHydrated('quiz'));
    expect(result.current).toBe(false);
    act(() => useQuizStore.setState({ _hasHydrated: true }));
    expect(result.current).toBe(true);
  });

  it('ignoră store-urile care nu sunt cerute', () => {
    act(() => useQuizStore.setState({ _hasHydrated: false }));
    const { result } = renderHook(() => useStoresHydrated('stats', 'notes'));
    expect(result.current).toBe(true);
  });
});
