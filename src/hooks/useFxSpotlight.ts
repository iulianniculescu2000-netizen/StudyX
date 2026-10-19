import { useEffect } from 'react';

/** Unghiurile maxime (grade) ale înclinării unui card sub mouse: destul cât să se simtă adâncimea, nu cât să se clatine. */
const TILT_X = 3;
const TILT_Y = 2.4;

/** Modul economic sau economisirea de energie: fără înclinare (CSS oprește oricum transformarea). */
const lite = () => {
  const root = document.documentElement;
  return root.getAttribute('data-performance') === 'lite' || root.getAttribute('data-power-save') === 'true';
};

/**
 * Feeds `.fx-spot` cards the pointer position (--mx / --my) so their accent light follows the cursor, and `.fx-lift` /
 * `.depth-card` cards the tilt toward the pointer (--tilt-x / --tilt-y, at most a few degrees; the CSS transition smooths it).
 * One delegated listener per page, at most one update per frame, only for a mouse (a finger has no hover), none under reduced motion.
 */
export function useFxSpotlight(): void {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || calm) return;

    let last: HTMLElement | null = null;
    let lastTilt: HTMLElement | null = null;
    let pending: PointerEvent | null = null;
    let frame = 0;
    const clear = (el: HTMLElement | null) => {
      el?.style.removeProperty('--mx');
      el?.style.removeProperty('--my');
    };
    const clearTilt = (el: HTMLElement | null) => {
      el?.style.removeProperty('--tilt-x');
      el?.style.removeProperty('--tilt-y');
    };
    const update = () => {
      frame = 0;
      const event = pending;
      if (!event) return;
      const element = event.target instanceof Element ? event.target : null;
      const target = element?.closest<HTMLElement>('.fx-spot') ?? null;
      if (last && last !== target) clear(last);
      last = target;
      if (target) {
        const rect = target.getBoundingClientRect();
        target.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        target.style.setProperty('--my', `${event.clientY - rect.top}px`);
      }
      const tilt = lite() ? null : element?.closest<HTMLElement>('.fx-lift, .depth-card') ?? null;
      if (lastTilt && lastTilt !== tilt) clearTilt(lastTilt);
      lastTilt = tilt;
      if (tilt) {
        const rect = tilt.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        tilt.style.setProperty('--tilt-x', `${(Math.max(-0.5, Math.min(0.5, px)) * TILT_X * 2).toFixed(2)}deg`);
        tilt.style.setProperty('--tilt-y', `${(-Math.max(-0.5, Math.min(0.5, py)) * TILT_Y * 2).toFixed(2)}deg`);
      }
    };
    const onMove = (event: PointerEvent) => {
      pending = event;
      if (!frame) frame = requestAnimationFrame(update);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
      clear(last);
      clearTilt(lastTilt);
    };
  }, []);
}
