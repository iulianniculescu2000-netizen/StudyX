import { create } from 'zustand';
import type { QuizColor } from '../types';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface ContentUpdate {
  id: string;
  title: string;
  subject: string;
  description: string;
  emoji: string;
  color: QuizColor;
  questionCount: number;
  quizCount: number;
  url: string;
  publishedAt: string;
}

export interface InstallerUpdate {
  url: string;
  fileName?: string;
  sha256?: string;
  size?: number;
}

export interface UpdateManifest {
  version: string;
  latestVersion?: string;
  releaseDate: string;
  changes: string[];
  files: { path: string; url: string }[];
  installer?: InstallerUpdate;
  delivery?: 'overlay' | 'installer' | 'native';
  isSequential?: boolean;
  stepsRemaining?: number;
  contentUpdates?: ContentUpdate[];
}

const INSTALLED_KEY = 'studyx-installed-content';

function loadInstalledIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persistInstalledIds(ids: string[]) {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota/storage failures for optional update metadata
  }
}

interface UpdateState {
  status: UpdateStatus;
  localVersion: string;
  manifest: UpdateManifest | null;
  downloadPercent: number;
  lastCheckedAt: number | null;
  error: string | null;
  downloadedInstallerPath: string | null;
  installedContentIds: string[];
  contentInstalling: string | null;
  showUpdateModal: boolean;
  setLocalVersion: (version: string) => void;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  applyUpdate: () => void;
  dismiss: () => void;
  markContentInstalled: (id: string) => void;
  setContentInstalling: (id: string | null) => void;
  setShowUpdateModal: (value: boolean) => void;
}

const api = () => (typeof window !== 'undefined' ? window.electronAPI : undefined);

type CheckResult = {
  localVersion: string;
  hasUpdate: boolean;
  version: string;
  latestVersion?: string;
  releaseDate: string;
  changes: string[];
  files: { path: string; url: string }[];
  installer?: InstallerUpdate;
  delivery?: 'overlay' | 'installer' | 'native';
  isSequential?: boolean;
  stepsRemaining?: number;
  contentUpdates?: ContentUpdate[];
};

type DownloadResult = { mode?: 'overlay' | 'installer' | 'native'; path?: string } | boolean;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  localVersion: '-',
  manifest: null,
  downloadPercent: 0,
  lastCheckedAt: null,
  error: null,
  downloadedInstallerPath: null,
  installedContentIds: loadInstalledIds(),
  contentInstalling: null,
  showUpdateModal: false,

  setLocalVersion: (version) => set({ localVersion: version }),

  checkForUpdate: async () => {
    const electron = api();
    if (!electron?.updaterCheck) return;

    set({ status: 'checking', error: null });

    try {
      const result = await electron.updaterCheck() as CheckResult;
      set({ localVersion: result.localVersion, lastCheckedAt: Date.now() });

      if (result.hasUpdate) {
        set({
          status: 'available',
          manifest: {
            version: result.version,
            latestVersion: result.latestVersion ?? result.version,
            releaseDate: result.releaseDate,
            changes: result.changes,
            files: result.files,
            installer: result.installer,
            delivery: result.delivery ?? 'overlay',
            isSequential: result.isSequential ?? false,
            stepsRemaining: result.stepsRemaining ?? 1,
            contentUpdates: result.contentUpdates ?? [],
          },
        });
        if (result.delivery === 'native') {
          void get().downloadUpdate();
        }
        return;
      }

      const contentUpdates = result.contentUpdates ?? [];
      set({
        status: 'up-to-date',
        manifest: contentUpdates.length > 0
          ? {
              version: result.localVersion,
              latestVersion: result.localVersion,
              releaseDate: '',
              changes: [],
              files: [],
              delivery: 'overlay',
              contentUpdates,
            }
          : null,
      });
    } catch (err: unknown) {
      set({
        status: 'error',
        lastCheckedAt: Date.now(),
        error: err instanceof Error ? err.message : 'Eroare necunoscută',
      });
    }
  },

  downloadUpdate: async () => {
    const { manifest } = get();
    const electron = api();
    if (!manifest || !electron?.updaterDownload) return;

    set({ status: 'downloading', downloadPercent: 0, error: null, downloadedInstallerPath: null });

    let unsubscribe: (() => void) | null = null;
    if (electron.onUpdateProgress) {
      unsubscribe = electron.onUpdateProgress((data: { percent: number }) => {
        set({ downloadPercent: data.percent });
      });
    }

    try {
      const result = await electron.updaterDownload(manifest) as DownloadResult;
      set({
        status: 'ready',
        downloadPercent: 100,
        downloadedInstallerPath: typeof result === 'object' && result?.mode === 'installer' ? result.path ?? null : null,
      });
    } catch (err: unknown) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Descărcarea a eșuat' });
    } finally {
      unsubscribe?.();
    }
  },

  applyUpdate: () => {
    const electron = api();
    const { manifest, downloadedInstallerPath } = get();

    if (manifest?.delivery === 'native') {
      if (!electron?.updaterInstallDownloaded) {
        set({ status: 'error', error: 'Actualizarea nativă nu este pregătită.' });
        return;
      }
      electron.updaterInstallDownloaded().catch((err: unknown) => {
        set({ status: 'error', error: err instanceof Error ? err.message : 'Actualizarea nu a putut fi aplicată.' });
      });
      return;
    }

    if (manifest?.delivery === 'installer') {
      if (!downloadedInstallerPath || !electron?.updaterInstallDownloaded) {
        set({ status: 'error', error: 'Programul de instalare nu este pregătit pentru lansare.' });
        return;
      }
      electron.updaterInstallDownloaded(downloadedInstallerPath).catch((err: unknown) => {
        set({ status: 'error', error: err instanceof Error ? err.message : 'Programul de instalare nu a putut fi lansat.' });
      });
      return;
    }

    if (!electron?.updaterRestart) {
      set({ status: 'error', error: 'Repornire imposibilă - redeschide aplicația manual.' });
      return;
    }
    electron.updaterRestart();
  },

  dismiss: () => set({ status: 'idle', error: null, manifest: null, downloadedInstallerPath: null }),

  markContentInstalled: (id) => {
    const next = [...new Set([...get().installedContentIds, id])];
    persistInstalledIds(next);
    set({ installedContentIds: next });
  },

  setContentInstalling: (id) => set({ contentInstalling: id }),

  setShowUpdateModal: (value) => {
    set({ showUpdateModal: value });
    if (value && get().status === 'idle') {
      void get().checkForUpdate();
    }
  },
}));
