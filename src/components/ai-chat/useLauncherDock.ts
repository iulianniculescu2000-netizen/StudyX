import { useEffect, useState } from 'react';

/** Lansatorul AI: buton de 56px la 24px de colțul din dreapta-jos, mascota depășește cu 8px. */
const LAUNCHER_ZONE = { size: 72, right: 16, bottom: 16 };
const CONTROLS = 'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  if (typeof (el as HTMLElement).checkVisibility === 'function') return (el as HTMLElement).checkVisibility();
  return true;
}

/** True dacă un control al paginii se află sub zona lansatorului. */
export function launcherCoversControl(root: ParentNode, viewport: { width: number; height: number }): boolean {
  const zone = {
    left: viewport.width - LAUNCHER_ZONE.right - LAUNCHER_ZONE.size,
    right: viewport.width - LAUNCHER_ZONE.right,
    top: viewport.height - LAUNCHER_ZONE.bottom - LAUNCHER_ZONE.size,
    bottom: viewport.height - LAUNCHER_ZONE.bottom,
  };
  for (const el of Array.from(root.querySelectorAll(CONTROLS))) {
    if (el.closest('[data-tutorial="ai-chat-button"]')) continue;
    const rect = el.getBoundingClientRect();
    const overlaps = rect.left < zone.right && rect.right > zone.left && rect.top < zone.bottom && rect.bottom > zone.top;
    if (overlaps && isVisible(el)) return true;
  }
  return false;
}

/**
 * Lansatorul AI plutește deasupra paginii și ar acoperi butoanele din colț (ex. „Joacă”, „Adaugă”).
 * Când sub el apare un control, se retrage la marginea ferestrei (rămâne un colț vizibil) și revine
 * la hover sau la focus. Controlul se reevaluează la scroll, redimensionare și schimbări în pagină.
 */
export function useLauncherDock(enabled: boolean): boolean {
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer: number | null = null;
    const evaluate = () => {
      timer = null;
      const root = document.querySelector('main');
      // În timpul turului butonul rămâne la locul lui: turul îl poate evidenția.
      if (!root || document.querySelector('[data-tour-keyboard-layer]')) { setDocked(false); return; }
      setDocked(launcherCoversControl(root, { width: window.innerWidth, height: window.innerHeight }));
    };
    const schedule = () => {
      if (timer === null) timer = window.setTimeout(evaluate, 140);
    };
    schedule();
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const root = document.querySelector('main');
    const observer = root ? new MutationObserver(schedule) : null;
    if (root) observer?.observe(root, { childList: true, subtree: true });
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [enabled]);

  return enabled && docked;
}
