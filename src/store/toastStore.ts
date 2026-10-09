import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  /** Optional inline action button (e.g. "Deschide" a relevant document). */
  action?: ToastAction;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number, action?: ToastAction) => void;
  removeToast: (id: string) => void;
  upsertToast: (id: string, message: string, type?: ToastType, duration?: number, action?: ToastAction) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'success', duration = 4000, action) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration, action }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  upsertToast: (id, message, type = 'info', duration = 4000, action) => {
    set((state) => {
      const exists = state.toasts.some((toast) => toast.id === id);
      if (exists) {
        return {
          toasts: state.toasts.map((toast) => (toast.id === id ? { ...toast, message, type, duration, action } : toast)),
        };
      }
      return {
        toasts: [...state.toasts, { id, message, type, duration, action }],
      };
    });
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
}));
