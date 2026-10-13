import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CursorGesture = 'idle' | 'pointer' | 'text' | 'grab' | 'loading' | 'thinking';

interface CursorState {
  enabled: boolean;
  gesture: CursorGesture;
  setEnabled: (enabled: boolean) => void;
}

export const CURSOR_STORAGE_KEY = 'studyx-cursor-settings';

export const useCursorStore = create<CursorState>()(
  persist(
    (set) => ({
      enabled: true,
      gesture: 'idle',
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: CURSOR_STORAGE_KEY,
      version: 2,
      // v1 also stored `trailEnabled` and `style`, which never had any effect; only `enabled` is kept.
      migrate: (persisted) => ({ enabled: (persisted as { enabled?: boolean } | null)?.enabled ?? true }),
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
);
