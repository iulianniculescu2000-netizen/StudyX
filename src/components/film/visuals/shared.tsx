import type { ReactNode } from 'react';
import { fraction, useSceneTime } from '../useTimeline';
import { FILM_CARD, STAGE } from '../stage';
/** No CSS/Motion transitions: pausing freezes even mid-entrance. */
export function Reveal({ at = 0, duration = 600, children, className = '' }: {
  at?: number; duration?: number; children: ReactNode; className?: string;
}) {
  const { elapsedMs, calm } = useSceneTime();
  const progress = calm ? 1 : fraction(elapsedMs, at, duration);
  const k = 1 - Math.pow(1 - progress, 3);
  return <div className={className} style={{ opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}>{children}</div>;
}
export function Panel({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[500px] rounded-[var(--r-lg)] p-5" style={FILM_CARD}>{children}</div>;
}
export function Label({ children, color = STAGE.blue }: { children: ReactNode; color?: string }) {
  return <div className="mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{children}</div>;
}
export function Note({ children, color = STAGE.green }: { children: ReactNode; color?: string }) {
  return <div className="mt-3 rounded-xl px-3 py-2 text-[12px] leading-relaxed" style={{ background: `${color}18`, color }}>{children}</div>;
}
