import { useEffect, useState } from 'react';

// Spotlight measurement and tooltip placement shared by every tour. Moved here unchanged from the
// original tutorial; the geometry (narrow windows, off-screen targets, anti-jitter) is already solved.

export interface SpotlightRect {
  top: number; left: number; width: number; height: number;
}

export function useSpotlight(selector: string | undefined, padding = 8) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;

    // Center steps (no selector) never read `rect` — the hook's return coerces it to null —
    // so there's nothing to reset here.
    if (!selector) return;

    const detach = () => {
      current = null;
      ro?.disconnect();
      ro = null;
      mo?.disconnect();
      mo = null;
    };

    // Remember the last committed rect so snap() only calls setRect when the geometry actually
    // moved. Without this guard, every re-measure pushed a new object and re-rendered.
    // `undefined` = nothing committed yet, so the first "no target" still clears the previous step's ring.
    let lastRect: SpotlightRect | null | undefined;
    const nearlyEqual = (a: SpotlightRect | null, b: SpotlightRect | null) => {
      if (a === b) return true;
      if (!a || !b) return false;
      return (
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5
      );
    };

    const commit = (next: SpotlightRect | null) => {
      if (lastRect !== undefined && nearlyEqual(next, lastRect)) return;
      lastRect = next;
      setRect(next);
    };

    const snap = () => {
      if (!current) return;
      const r = current.getBoundingClientRect();
      // A found-but-scrolled-off-screen target (e.g. a button below the fold) would put the
      // spotlight and tooltip outside the viewport, leaving only the dark overlay visible.
      // Treat that as "no anchor" so the tooltip falls back to a centered, always-visible card.
      const fullyOffscreen =
        r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth;
      if (fullyOffscreen || (r.width === 0 && r.height === 0)) {
        commit(null);
        return;
      }
      commit({
        top: r.top - padding,
        left: r.left - padding,
        width: r.width + padding * 2,
        height: r.height + padding * 2,
      });
    };

    const attach = (el: HTMLElement) => {
      detach();
      current = el;
      // The SVG mask already cuts a fully-undimmed hole around the target, and the
      // pulsing ring border (rendered separately) signals focus — an extra CSS
      // brightness/saturate boost on top of that was pushing already-colorful
      // elements (gradient nav pills) into a garish, oversaturated look.
      ro = new ResizeObserver(snap);
      ro.observe(el);
      // Only scroll if the target isn't already comfortably in view — and do it instantly, so
      // the spotlight doesn't have to chase a smooth-scrolling target (that chase was the jitter).
      const r = el.getBoundingClientRect();
      const partlyOffscreen = r.top < 0 || r.bottom > window.innerHeight;
      if (partlyOffscreen) {
        try {
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
        } catch {
          /* scrollIntoView options unsupported — ignore */
        }
      }
      snap();
    };

    const resolveTarget = () => {
      const found = document.querySelector(selector) as HTMLElement | null;
      if (found && found !== current) {
        attach(found);
      } else if (!found) {
        detach();
        commit(null);
      } else {
        snap();
      }
    };

    resolveTarget();
    const frame = requestAnimationFrame(resolveTarget);
    const settle = setTimeout(resolveTarget, 180);
    // Watch only for elements being added/removed (so a target appears after navigation).
    // NOT attributes: framer-motion mutates inline styles every animation frame, which turned
    // this observer into a per-frame re-render loop — the "trembling" the user saw.
    mo = new MutationObserver(resolveTarget);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', snap);
    window.addEventListener('scroll', snap, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', snap);
    vv?.addEventListener('scroll', snap);

    return () => {
      vv?.removeEventListener('resize', snap);
      vv?.removeEventListener('scroll', snap);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      detach();
      window.removeEventListener('resize', snap);
      window.removeEventListener('scroll', snap, true);
    };
  }, [selector, padding]);

  return selector ? rect : null;
}
