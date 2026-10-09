import { create } from 'zustand';

export type HealthStatus = 'healthy' | 'warning' | 'degraded';
export type DiagnosticEventLevel = 'info' | 'warning' | 'error';

export interface HealthCheckItem {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

export interface DiagnosticEvent {
  id: string;
  area: 'ai' | 'startup' | 'storage' | 'updater' | 'ui' | 'runtime';
  level: DiagnosticEventLevel;
  title: string;
  detail: string;
  createdAt: number;
}

interface DiagnosticsStore {
  healthStatus: HealthStatus;
  checks: HealthCheckItem[];
  events: DiagnosticEvent[];
  lastCheckedAt: number | null;
  setHealthReport: (status: HealthStatus, checks: HealthCheckItem[]) => void;
  addEvent: (event: Omit<DiagnosticEvent, 'id' | 'createdAt'>) => void;
  clearEvents: () => void;
  clearDiagnostics: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsStore>()((set) => ({
  healthStatus: 'healthy',
  checks: [],
  events: [],
  lastCheckedAt: null,
  setHealthReport: (healthStatus, checks) => set({ healthStatus, checks, lastCheckedAt: Date.now() }),
  addEvent: (event) => set((state) => ({
    events: [
      {
        ...event,
        id: `${event.area}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
      },
      ...state.events,
    ].slice(0, 30),
  })),
  clearEvents: () => set({ events: [] }),
  clearDiagnostics: () => set({ healthStatus: 'healthy', checks: [], events: [], lastCheckedAt: null }),
}));

export function logDiagnosticEvent(event: Omit<DiagnosticEvent, 'id' | 'createdAt'>) {
  useDiagnosticsStore.getState().addEvent(event);
}
