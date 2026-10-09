import { useEffect } from 'react';

/**
 * Marks the document while a fullscreen overlay is on screen.
 *
 * The ambient background orbs animate behind every overlay's backdrop-filter,
 * which forces the browser to re-blur the whole backdrop on every frame — the
 * animations inside the overlay then look like they stutter. The CSS rule keyed
 * off this attribute takes the orbs out of the paint entirely while an overlay
 * is open; they are invisible under it regardless.
 *
 * Reference-counted, so two overlays closing in sequence can't clear the flag
 * while one is still open.
 */
let openOverlays = 0;

export function useOverlayFlag(active: boolean) {
  useEffect(() => {
    if (!active) return;

    openOverlays += 1;
    document.documentElement.dataset.overlay = 'open';

    return () => {
      openOverlays = Math.max(0, openOverlays - 1);
      if (openOverlays === 0) delete document.documentElement.dataset.overlay;
    };
  }, [active]);
}
