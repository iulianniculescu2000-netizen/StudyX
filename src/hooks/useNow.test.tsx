import { Profiler } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hourBucket, useNow } from './useNow';
import { usePageVisible } from './usePageVisible';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  cleanup();
  setVisibility('visible');
  vi.useFakeTimers();
});

describe('usePageVisible', () => {
  it('urmărește visibilitychange', () => {
    const { result } = renderHook(() => usePageVisible());
    expect(result.current).toBe(true);
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(false);
    act(() => setVisibility('visible'));
    expect(result.current).toBe(true);
  });
});

describe('useNow', () => {
  it('redesenează doar când se schimbă cheia (ora), nu la fiecare minut', () => {
    vi.setSystemTime(new Date(2026, 10, 22, 10, 5, 0));
    const onRender = vi.fn();
    function Clock() {
      const now = useNow(60_000, hourBucket);
      return <span>{now.getHours()}</span>;
    }
    const { container } = render(<Profiler id="ceas" onRender={onRender}><Clock /></Profiler>);
    const start = onRender.mock.calls.length;
    act(() => { vi.advanceTimersByTime(30 * 60_000); }); // 10:35, aceeași oră
    expect(onRender.mock.calls.length).toBe(start);
    expect(container.textContent).toBe('10');
    act(() => { vi.advanceTimersByTime(30 * 60_000); }); // 11:05
    expect(container.textContent).toBe('11');
    expect(onRender.mock.calls.length).toBe(start + 1);
  });

  it('fără cheie, avansează la fiecare interval (ca un setInterval simplu)', () => {
    vi.setSystemTime(new Date(2026, 10, 22, 10, 0, 0));
    const { result } = renderHook(() => useNow(60_000));
    const first = result.current.getTime();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.getTime() - first).toBeGreaterThanOrEqual(60_000);
  });

  it('stă cât fereastra e ascunsă și se actualizează imediat la revenire', () => {
    vi.setSystemTime(new Date(2026, 10, 22, 10, 0, 0));
    const { result } = renderHook(() => useNow(60_000));
    act(() => { vi.advanceTimersByTime(1); });
    act(() => setVisibility('hidden'));
    const hiddenAt = result.current.getTime();
    act(() => { vi.advanceTimersByTime(10 * 60_000); });
    expect(result.current.getTime()).toBe(hiddenAt);
    expect(vi.getTimerCount()).toBe(0);
    act(() => setVisibility('visible'));
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.getTime() - hiddenAt).toBeGreaterThanOrEqual(10 * 60_000);
  });
});
