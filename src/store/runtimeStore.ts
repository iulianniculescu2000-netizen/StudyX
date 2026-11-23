import { create } from 'zustand';
import type { PerformanceMode } from '../lib/deviceTier';

type RuntimeFeatureFlags = {
  diagnosticsPanel: boolean;
  backgroundQueue: boolean;
  safeStartup: boolean;
};

export const RUNTIME_SETTINGS_STORAGE_KEY = 'studyx-runtime-settings';
export const RUNTIME_SCHEMA_VERSION = 2;

const DEFAULT_FEATURE_FLAGS: RuntimeFeatureFlags = {
  diagnosticsPanel: true,
  backgroundQueue: true,
  safeStartup: true,
};

interface PersistedRuntimeSettings {
  schemaVersion: number;
  performanceMode: PerformanceMode;
  lowPowerMode: boolean;
  lowPowerManual?: boolean;
  featureFlags: RuntimeFeatureFlags;
}

interface RuntimeStore {
  schemaVersion: number;
  performanceMode: PerformanceMode;
  lowPowerMode: boolean;
  lowPowerManual: boolean;
  featureFlags: RuntimeFeatureFlags;
  setPerformanceMode: (mode: PerformanceMode) => void;
  setLowPowerMode: (enabled: boolean) => void;
  /**
   * Same effect as setLowPowerMode(true) but doesn't persist — for the
   * automatic "previous boot didn't finish" safety net (see App.tsx /
   * startupSessionGuard.ts). That detector can't tell a real crash apart from
   * the app just being closed a second after opening, so degrading THIS
   * session is a reasonable precaution, but writing it to localStorage would
   * silently and permanently flatten every animation in the app on every
   * future launch until the user happens to find the Setări toggle — a much
   * bigger cost than one cautious session.
   */
  setLowPowerModeForThisSessionOnly: () => void;
  setFeatureFlag: <K extends keyof RuntimeFeatureFlags>(flag: K, enabled: RuntimeFeatureFlags[K]) => void;
}

function normalizePerformanceMode(value: unknown): PerformanceMode {
  return value === 'auto' || value === 'lite' || value === 'full' ? value : 'auto';
}

function persist(state: PersistedRuntimeSettings) {
  try {
    localStorage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: runtime tuning still works for this session.
  }
}

export function loadRuntimeSettings() {
  const defaults = {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    performanceMode: 'auto' as PerformanceMode,
    lowPowerMode: false,
    lowPowerManual: false,
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
  };
  try {
    const raw = localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<PersistedRuntimeSettings>;
    const performanceMode = normalizePerformanceMode(parsed.performanceMode);
    const featureFlags: RuntimeFeatureFlags = {
      diagnosticsPanel: parsed.featureFlags?.diagnosticsPanel ?? true,
      backgroundQueue: parsed.featureFlags?.backgroundQueue ?? true,
      safeStartup: parsed.featureFlags?.safeStartup ?? true,
    };

    const isCurrentSchema = typeof parsed.schemaVersion === 'number' && parsed.schemaVersion >= RUNTIME_SCHEMA_VERSION;
    if (!isCurrentSchema) {
      // Versiunile 1.0.x salvau permanent `lowPowerMode: true` la orice `hadUncleanExit`.
      // La migrarea către schema v2 resetăm `lowPowerMode` la `false`, păstrând restul preferințelor.
      const migrated: PersistedRuntimeSettings = {
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        performanceMode,
        lowPowerMode: false,
        lowPowerManual: false,
        featureFlags,
      };
      persist(migrated);
      return {
        ...migrated,
        lowPowerManual: false,
      };
    }

    const lowPowerManual = typeof parsed.lowPowerManual === 'boolean'
      ? parsed.lowPowerManual
      : Boolean(parsed.lowPowerMode);

    return {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      performanceMode,
      lowPowerMode: lowPowerManual,
      lowPowerManual,
      featureFlags,
    };
  } catch {
    return defaults;
  }
}

const initial = loadRuntimeSettings();

export const useRuntimeStore = create<RuntimeStore>()((set, get) => ({
  ...initial,
  setPerformanceMode: (performanceMode) => {
    set({ performanceMode });
    persist({
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      performanceMode,
      lowPowerMode: get().lowPowerManual,
      lowPowerManual: get().lowPowerManual,
      featureFlags: get().featureFlags,
    });
  },
  setLowPowerMode: (lowPowerMode) => {
    set({ schemaVersion: RUNTIME_SCHEMA_VERSION, lowPowerMode, lowPowerManual: lowPowerMode });
    persist({
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      performanceMode: get().performanceMode,
      lowPowerMode,
      lowPowerManual: lowPowerMode,
      featureFlags: get().featureFlags,
    });
  },
  setLowPowerModeForThisSessionOnly: () => set({ lowPowerMode: true }),
  setFeatureFlag: (flag, enabled) => {
    const featureFlags = { ...get().featureFlags, [flag]: enabled };
    set({ featureFlags });
    persist({
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      performanceMode: get().performanceMode,
      lowPowerMode: get().lowPowerManual,
      lowPowerManual: get().lowPowerManual,
      featureFlags,
    });
  },
}));
