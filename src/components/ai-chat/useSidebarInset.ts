import { useEffect, useState } from 'react';

const SIDEBAR_SELECTOR = '.studyx-sidebar';

/**
 * Right edge (px) of the app sidebar, so a full-window panel can start right
 * after it and leave the navigation usable. Follows the sidebar while it
 * collapses/expands (its width animates) and returns 0 when there is no sidebar
 * on screen (mobile layout, focus mode).
 */
export function useSidebarInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;
    const element = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
    const measure = () => setInset(element ? Math.round(element.getBoundingClientRect().right) : 0);
    measure();
    if (!element) return;

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [active]);

  return active ? inset : 0;
}
