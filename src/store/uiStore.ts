import { create } from 'zustand';

interface UIStore {
  chatOpen: boolean;
  floatingUILocks: string[];
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  lockFloatingUI: (lockId: string) => void;
  unlockFloatingUI: (lockId: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  chatOpen: false,
  floatingUILocks: [],
  setChatOpen: (chatOpen) => {
    set({ chatOpen });
    // Dispatch global event for non-zustand components if any
    window.dispatchEvent(new CustomEvent('studyx:chat', { detail: { open: chatOpen } }));
  },
  toggleChat: () => set((state) => {
    const next = !state.chatOpen;
    window.dispatchEvent(new CustomEvent('studyx:chat', { detail: { open: next } }));
    return { chatOpen: next };
  }),
  lockFloatingUI: (lockId) => set((state) => (
    state.floatingUILocks.includes(lockId)
      ? state
      : { floatingUILocks: [...state.floatingUILocks, lockId] }
  )),
  unlockFloatingUI: (lockId) => set((state) => (
    state.floatingUILocks.includes(lockId)
      ? { floatingUILocks: state.floatingUILocks.filter((entry) => entry !== lockId) }
      : state
  )),
}));
