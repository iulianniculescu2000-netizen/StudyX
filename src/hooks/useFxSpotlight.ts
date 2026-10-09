import { useEffect } from 'react';

/**
 * Feeds `.fx-spot` cards the pointer position (--mx / --my) so their accent light follows the cursor.
 * One delegated listener per page, only for a mouse (a finger has no hover), and none under reduced motion.
 */
export function useFxSpotlight(): void {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || calm) return;

    let last: HTMLElement | null = null;
    const clear = (el: HTMLElement | null) => {
      el?.style.removeProperty('--mx');
      el?.style.removeProperty('--my');
    };
    const onMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.fx-spot') : null;
      if (last && last !== target) clear(last);
      last = target;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      target.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      clear(last);
    };
  }, []);
}
