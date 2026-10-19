import { useEffect } from 'react';
import { useCursorStore } from '../../store/cursorStore';
import { useTheme } from '../../theme/ThemeContext';
import { useVaultUploadStore } from '../../store/vaultUploadStore';
import { buildCursorVars } from './cursorImages';

export const CURSOR_ACTIVE_CLASS = 'studyx-custom-cursor-active';

/**
 * Cursorul StudyX. Nu desenează nimic în pagină: dă sistemului imaginile SVG prin variabile CSS
 * (vezi `index.css`), așa că urmărește mouse-ul fără întârziere, ca săgeata nativă.
 */
export default function StudyXHandCursor() {
  const enabled = useCursorStore((s) => s.enabled);
  const manualGesture = useCursorStore((s) => s.gesture);
  const theme = useTheme();
  // Încărcările din fundal primesc un mic indicator lângă săgeată.
  const activeUploads = useVaultUploadStore((s) => s.tasks.some((t) => t.status !== 'completed' && t.status !== 'error'));
  const busy = activeUploads || manualGesture === 'loading' || manualGesture === 'thinking';
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const active = enabled && !isTouchDevice;

  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.classList.remove(CURSOR_ACTIVE_CLASS);
      return;
    }
    const vars = buildCursorVars(theme.accent, busy);
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    root.classList.add(CURSOR_ACTIVE_CLASS);
    return () => {
      root.classList.remove(CURSOR_ACTIVE_CLASS);
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
    };
  }, [active, theme.accent, busy]);

  return null;
}
