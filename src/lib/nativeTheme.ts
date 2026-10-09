import type { ThemeId, ThemeMode } from '../theme/themes';

interface NativeThemeBridge {
  electronAPI?: {
    setTheme?: (payload: { mode: ThemeMode; resolved: ThemeId; background: string }) => void;
  };
}

/**
 * Tells the desktop shell which theme is active so the native parts follow it:
 * the window's background colour (visible while resizing or reloading) and
 * `nativeTheme` (context menus, native scrollbars). One direction only —
 * renderer → main — so the two can never fight over "auto". No-op in the browser.
 */
export function notifyNativeTheme(mode: ThemeMode, resolved: ThemeId, background: string): void {
  if (typeof window === 'undefined') return;
  try {
    (window as unknown as NativeThemeBridge).electronAPI?.setTheme?.({ mode, resolved, background });
  } catch {
    // the shell is optional; a failed notification must never break theming
  }
}
