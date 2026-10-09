import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME_MODE, normalizeThemeMode, type ThemeMode } from '../theme/themes';

/** Also read by the inline script in index.html (before React) — keep the key and the persisted shape in sync. */
export const THEME_MODE_STORAGE_KEY = 'studyx-theme-mode';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

/**
 * Luminos / Întunecat / Automat. A per-device preference on purpose, not part of
 * a profile: it depends on the screen and the time of day, and it has to be
 * applied on the profile-picker screen, before any profile is active.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: DEFAULT_THEME_MODE,
      setMode: (mode) => set({ mode: normalizeThemeMode(mode) }),
    }),
    {
      name: THEME_MODE_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ mode: state.mode }),
      // Never trust storage: an unknown value falls back to "follow the system".
      merge: (persisted, current) => ({
        ...current,
        mode: normalizeThemeMode((persisted as { mode?: unknown } | null)?.mode),
      }),
    },
  ),
);
