import { useEffect, useState } from 'react';

/**
 * Cronologia unei scene din filmul de bun venit: întoarce câte dintre momentele `marks` (în milisecunde de la
 * montare) au trecut. Cu mișcare redusă scena apare direct în starea finală.
 */
export function useTimeline(marks: readonly number[], calm: boolean): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (calm) return undefined;
    const timers = marks.map((ms, i) => window.setTimeout(() => setPhase(i + 1), ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [calm, marks]);
  return calm ? marks.length : phase;
}

/** Text care se scrie literă cu literă, începând după `startMs`. */
export function useTyped(text: string, startMs: number, calm: boolean, stepMs = 38): string {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (calm) return undefined;
    let interval = 0;
    const starter = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setCount((n) => {
          if (n + 1 >= text.length) window.clearInterval(interval);
          return Math.min(text.length, n + 1);
        });
      }, stepMs);
    }, startMs);
    return () => {
      window.clearTimeout(starter);
      window.clearInterval(interval);
    };
  }, [calm, startMs, stepMs, text]);
  return calm ? text : text.slice(0, count);
}

/** Număr care alunecă de la `from` la `to` în `durationMs`, după `startMs`. */
export function useCountTo(from: number, to: number, startMs: number, durationMs: number, calm: boolean): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (calm) return undefined;
    let interval = 0;
    const starter = window.setTimeout(() => {
      const t0 = performance.now();
      interval = window.setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / durationMs);
        const eased = 1 - (1 - k) * (1 - k);
        setValue(Math.round(from + (to - from) * eased));
        if (k >= 1) window.clearInterval(interval);
      }, 50);
    }, startMs);
    return () => {
      window.clearTimeout(starter);
      window.clearInterval(interval);
    };
  }, [calm, durationMs, from, startMs, to]);
  return calm ? to : value;
}
