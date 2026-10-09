import { create } from 'zustand';

export type SavePhase = 'idle' | 'saving' | 'saved' | 'error' | 'recovering';

interface SaveStatusStore {
  phase: SavePhase;
  message: string;
  lastSavedAt: number | null;
  setSaving: (message?: string) => void;
  setSaved: (message?: string) => void;
  setRecovering: (message?: string) => void;
  setError: (message?: string) => void;
  reset: () => void;
}

let resetTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleReset(set: (updater: Partial<SaveStatusStore>) => void, delay: number) {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    set({ phase: 'idle', message: '', lastSavedAt: Date.now() });
    resetTimer = null;
  }, delay);
}

export const useSaveStatusStore = create<SaveStatusStore>((set) => ({
  phase: 'idle',
  message: '',
  lastSavedAt: null,
  setSaving: (message = 'Se salvează') => {
    if (resetTimer) clearTimeout(resetTimer);
    set({ phase: 'saving', message });
  },
  setSaved: (message = 'Salvat') => {
    set({ phase: 'saved', message, lastSavedAt: Date.now() });
    scheduleIdleReset(set, 1800);
  },
  setRecovering: (message = 'Recuperăm datele') => {
    if (resetTimer) clearTimeout(resetTimer);
    set({ phase: 'recovering', message });
  },
  setError: (message = 'Eroare la salvare') => {
    if (resetTimer) clearTimeout(resetTimer);
    set({ phase: 'error', message });
    scheduleIdleReset(set, 3200);
  },
  reset: () => {
    if (resetTimer) clearTimeout(resetTimer);
    set({ phase: 'idle', message: '' });
  },
}));
