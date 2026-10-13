import { createContext, useContext } from 'react';

/** Every visual is a pure projection of the film clock. No scene owns a timer. */
export const FilmTime = createContext({ elapsedMs: 0, calm: false });
export function fraction(elapsed: number, start: number, duration: number): number {
  return Math.max(0, Math.min(1, (elapsed - start) / duration));
}
export function useSceneTime() { return useContext(FilmTime); }
export function useTimeline(marks: readonly number[], calm = false): number {
  const time = useSceneTime();
  return calm || time.calm ? marks.length : marks.filter((mark) => time.elapsedMs >= mark).length;
}
export function useTyped(text: string, startMs: number, calm = false, stepMs = 38): string {
  const time = useSceneTime();
  return calm || time.calm ? text : text.slice(0, Math.max(0, Math.floor((time.elapsedMs - startMs) / stepMs)));
}
export function useCountTo(from: number, to: number, startMs: number, durationMs: number, calm = false): number {
  const time = useSceneTime();
  const k = fraction(time.elapsedMs, startMs, durationMs);
  return calm || time.calm ? to : Math.round(from + (to - from) * (1 - (1 - k) ** 2));
}
