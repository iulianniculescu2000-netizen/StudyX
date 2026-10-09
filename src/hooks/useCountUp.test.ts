/**
 * The count-up animation schedules each frame from inside the previous one.
 * Only the first frame's id was ever captured, so the cleanup cancelled a frame
 * that had already run while the live one kept going — against an unmounted
 * hook, or alongside a second chain when the target changed mid-animation.
 */
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountUp } from './useCountUp';

vi.mock('./useAdaptiveMotion', () => ({
  useAdaptiveMotion: () => ({ calmMotion: false }),
}));

let pending: Map<number, FrameRequestCallback>;
let nextId: number;

/** Runs every frame currently queued (callbacks may queue further frames). */
function flushOneFrame() {
  const due = [...pending.entries()];
  pending.clear();
  act(() => {
    due.forEach(([, cb]) => cb(performance.now()));
  });
}

beforeEach(() => {
  pending = new Map();
  nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCountUp', () => {
  // The hook only animates when the target CHANGES — on first mount the start
  // value equals the target, so every case here has to move it first.
  it('leaves no frame running after unmount', () => {
    const { rerender, unmount } = renderHook(({ target }) => useCountUp(target, 600), {
      initialProps: { target: 0 },
    });
    rerender({ target: 100 });

    // Get past the first frame, so the live id is no longer the one captured
    // when the effect ran — that gap is exactly what used to leak.
    flushOneFrame();
    expect(pending.size, 'animation should still be running').toBe(1);

    unmount();
    expect(pending.size, 'the in-flight frame must be cancelled').toBe(0);
  });

  it('does not leave two chains running when the target changes mid-animation', () => {
    const { rerender } = renderHook(({ target }) => useCountUp(target, 600), {
      initialProps: { target: 0 },
    });
    rerender({ target: 100 });

    flushOneFrame();
    expect(pending.size).toBe(1);

    // A new target restarts the animation; the previous chain must not survive
    // alongside it, or both write the same state and the number jitters.
    rerender({ target: 250 });
    expect(pending.size, 'only the newest animation may be queued').toBe(1);
  });

  it('settles on the requested value once the animation completes', () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 0), {
      initialProps: { target: 0 },
    });
    rerender({ target: 42 });
    flushOneFrame();
    expect(result.current).toBe(42);
  });
});
