import { useCallback, useEffect, useRef, useState } from 'react';

export function scenePosition(elapsed: number, durations: readonly number[]) {
  let start = 0;
  for (let index = 0; index < durations.length; index++) {
    if (elapsed < start + durations[index] || index === durations.length - 1) return { index, start, elapsed: Math.max(0, elapsed - start) };
    start += durations[index];
  }
  return { index: 0, start: 0, elapsed: 0 };
}

/** One monotonic clock, including visual loading and visibility suspension. */
export function usePlayback(enabled: boolean, durationMs: number, ready: (elapsed: number) => boolean = () => true, publishEveryMs = 1000 / 30) {
  const [elapsedMs, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const position = useRef(0);
  const last = useRef<number | null>(null);
  const publishedAt = useRef(0);
  const running = enabled && ready(elapsedMs) && !paused && !hidden && elapsedMs < durationMs;
  const flush = useCallback((immediate = true) => {
    if (last.current !== null) {
      const now = performance.now();
      position.current = Math.min(durationMs, position.current + Math.max(0, now - last.current));
      last.current = now;
      if (immediate || now - publishedAt.current >= publishEveryMs || position.current >= durationMs) {
        publishedAt.current = immediate ? now : publishedAt.current + Math.floor((now - publishedAt.current) / publishEveryMs) * publishEveryMs;
        setElapsed(position.current);
      }
    }
  }, [durationMs, publishEveryMs]);
  useEffect(() => {
    const change = () => { flush(); last.current = null; setHidden(document.hidden); };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [flush]);
  useEffect(() => {
    if (!running) { last.current = null; return; }
    last.current = performance.now();
    let frame = 0;
    const tick = () => { flush(false); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); last.current = null; };
  }, [flush, running]);
  const seek = useCallback((ms: number) => {
    position.current = Math.max(0, Math.min(durationMs, ms));
    if (last.current !== null) last.current = performance.now();
    setElapsed(position.current);
  }, [durationMs]);
  const toggle = useCallback(() => { flush(); last.current = null; setPaused((value) => !value); }, [flush]);
  const reset = useCallback(() => { seek(0); setPaused(false); }, [seek]);
  return { elapsedMs, paused, hidden, running, seek, toggle, reset };
}
