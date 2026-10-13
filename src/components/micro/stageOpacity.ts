import { fraction } from '../film/useTimeline';

const FADE_MS = 280;

/** Opacitatea unei etape între `from` și `to`, cu intrare și ieșire scurte; ultima etapă (până la `total`) nu se stinge. */
export function stageOpacity(elapsedMs: number, from: number, to: number, total: number): number {
  const fadeIn = fraction(elapsedMs, from, FADE_MS);
  const fadeOut = to >= total ? 1 : 1 - fraction(elapsedMs, to - FADE_MS, FADE_MS);
  return Math.min(fadeIn, fadeOut);
}
