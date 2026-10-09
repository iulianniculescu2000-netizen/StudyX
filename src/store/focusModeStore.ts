import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FocusModeStore {
  focusMode: boolean;
  examMode: boolean;
  screenshotProtection: boolean;
  toggleFocusMode: () => void;
  setFocusMode: (v: boolean) => void;
  setExamMode: (v: boolean) => void;
  setContentProtection: (v: boolean) => void;
}

export const useFocusModeStore = create<FocusModeStore>()(
  persist(
    (set) => ({
      focusMode: false,
      examMode: false,
      screenshotProtection: false,
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setFocusMode: (v) => set({ focusMode: v }),
      setExamMode: (v) => set({ examMode: v, focusMode: v }), // Exam implies focus
      setContentProtection: (v) => {
        set({ screenshotProtection: v });
        if (window.electronAPI) {
          window.electronAPI.setContentProtection(v);
        }
      },
    }),
    {
      name: 'studyx-focus-mode',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.focusMode = false;
          state.examMode = false;
        }
      },
    },
  ),
);
