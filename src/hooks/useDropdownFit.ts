import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

export interface DropdownFit {
  /** True when the list should open above the anchor. */
  flipUp: boolean;
  /** Available height (px) in the chosen direction, capped at `desired`. */
  maxHeight: number;
}

/**
 * Keeps an absolutely positioned dropdown inside the viewport.
 * Measures the anchor (the `relative` wrapper) when opened and on resize/scroll,
 * then picks the direction with more room and caps the height to it.
 */
export function useDropdownFit(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  { desired = 260, min = 120, margin = 12, gap = 8 }: { desired?: number; min?: number; margin?: number; gap?: number } = {},
): DropdownFit {
  const [fit, setFit] = useState<DropdownFit>({ flipUp: false, maxHeight: desired });

  const measure = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const flipUp = below < Math.min(desired, 200) && above > below;
    const room = flipUp ? above : below;
    const next = { flipUp, maxHeight: Math.max(min, Math.min(desired, room)) };
    setFit((prev) => (prev.flipUp === next.flipUp && prev.maxHeight === next.maxHeight ? prev : next));
  }, [anchorRef, desired, gap, margin, min]);

  useLayoutEffect(() => {
    // DOM measurement after open; state update is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  return fit;
}

/** Inline style that anchors the popover above/below the wrapper and caps its height. */
export function dropdownFitStyle(fit: DropdownFit, gap = '0.5rem'): CSSProperties {
  return {
    ...(fit.flipUp ? { bottom: `calc(100% + ${gap})` } : { top: `calc(100% + ${gap})` }),
    maxHeight: fit.maxHeight,
    overflowY: 'auto',
  };
}
