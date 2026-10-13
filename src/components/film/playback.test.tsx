import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scenePosition, usePlayback } from './usePlayback';
import { FilmTime, useCountTo, useTimeline, useTyped } from './useTimeline';
import { Reveal } from './visuals/shared';
import { parseNarration } from './narration';
import { FILM_SCENES } from './scenes';

function Samples() {
  const typed = useTyped('abcdefghij', 200, false, 100);
  const count = useCountTo(0, 100, 0, 2000);
  const phase = useTimeline([300, 1000]);
  return <Reveal at={200} duration={1500}><output>{typed}|{count}|{phase}</output></Reveal>;
}

describe('film clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    // Stable clock independent of jsdom's frame scheduling.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('freezes typing, counters, phases and a mid-entrance transform, then resumes without catching up', () => {
    const { result } = renderHook(() => usePlayback(true, 6000));
    act(() => { vi.advanceTimersByTime(720); });
    act(() => result.current.toggle());
    const elapsed = result.current.elapsedMs;
    const view = render(<FilmTime.Provider value={{ elapsedMs: elapsed, calm: false }}><Samples /></FilmTime.Provider>);
    const html = view.container.innerHTML;
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.elapsedMs).toBe(elapsed);
    view.rerender(<FilmTime.Provider value={{ elapsedMs: result.current.elapsedMs, calm: false }}><Samples /></FilmTime.Provider>);
    expect(view.container.innerHTML).toBe(html);
    act(() => result.current.toggle());
    act(() => { vi.advanceTimersByTime(320); });
    expect(result.current.elapsedMs).toBeGreaterThan(elapsed + 290);
    expect(result.current.elapsedMs).toBeLessThan(elapsed + 340);
  });

  it('suspends in hidden tabs and respects a manual pause after returning', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const { result } = renderHook(() => usePlayback(true, 60000));
    act(() => { vi.advanceTimersByTime(500); hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); });
    const elapsed = result.current.elapsedMs;
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.elapsedMs).toBe(elapsed);
    act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.elapsedMs).toBeGreaterThan(elapsed);
    act(() => result.current.toggle());
    act(() => { hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.running).toBe(false);
  });

  it('seeks during playback, waits for lazy content, caps the final hold and resets', () => {
    const { result, rerender } = renderHook(({ ready }) => usePlayback(true, 2000, () => ready), { initialProps: { ready: true } });
    act(() => { vi.advanceTimersByTime(200); result.current.seek(1000); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.elapsedMs).toBeGreaterThan(1000);
    rerender({ ready: false });
    const elapsed = result.current.elapsedMs;
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.elapsedMs).toBe(elapsed);
    rerender({ ready: true });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.elapsedMs).toBe(2000);
    expect(result.current.running).toBe(false);
    act(() => result.current.reset());
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.running).toBe(true);
  });

  it('publishes calm mode at 10fps while pause captures the exact monotonic position', () => {
    let renders = 0;
    const { result } = renderHook(() => { renders++; return usePlayback(true, 6000, () => true, 100); });
    for (let i = 0; i < 62; i++) act(() => { vi.advanceTimersByTime(16); });
    expect(renders).toBeLessThanOrEqual(12);
    act(() => { vi.advanceTimersByTime(9); result.current.toggle(); });
    expect(result.current.elapsedMs).toBe(1001);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.elapsedMs).toBe(1001);
  });

  it('calm visuals show complete static content independent of clock time', () => {
    const view = render(<FilmTime.Provider value={{ elapsedMs: 0, calm: true }}><Samples /></FilmTime.Provider>);
    expect(view.container.textContent).toBe('abcdefghij|100|2');
    const html = view.container.innerHTML;
    view.rerender(<FilmTime.Provider value={{ elapsedMs: 5000, calm: true }}><Samples /></FilmTime.Provider>);
    expect(view.container.innerHTML).toBe(html);
  });

  it('has a 60-second default story and exact boundaries including the final scene', () => {
    const durations = FILM_SCENES.map((scene) => scene.durationMs);
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBe(60000);
    expect(scenePosition(6000, durations)).toEqual({ index: 1, start: 6000, elapsed: 0 });
    expect(scenePosition(60000, durations)).toEqual({ index: 6, start: 56000, elapsed: 4000 });
  });

  it('accepts optional narration shapes and rejects invalid durations', () => {
    expect(parseNarration({ scenes: [{ id: 'intro', text: 'Bun venit', durationMs: 7080 }] })).toEqual([{ id: 'intro', text: 'Bun venit', durationMs: 7080 }]);
    expect(parseNarration({ quiz: { text: 'Grile', durationMs: -1 } })).toEqual([{ id: 'quiz', text: 'Grile', durationMs: undefined }]);
    expect(parseNarration(null)).toEqual([]);
  });
});
