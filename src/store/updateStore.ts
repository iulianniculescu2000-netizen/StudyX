import { create } from 'zustand';
import type { QuizColor } from '../types';
import { buildBackupPayload, resolveAppVersion } from '../hooks/useAutoBackup';
import { useUserStore } from './userStore';
import { useToastStore } from './toastStore';
import {
  EMPTY_DOWNLOAD_STATS, createSpeedTracker, isSnoozed, loadSnoozeUntil, persistSnoozeUntil,
  snoozeUntilTonight, type DownloadStats,
} from '../lib/updateUi';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

/** Unde a căzut ultima eroare: decide dacă butonul reia descărcarea sau reia verificarea. */
export type UpdateErrorStage = 'check' | 'download' | 'install';

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
  downloadStats: DownloadStats;
  errorStage: UpdateErrorStage | null;
  /** Până când (ms) nu mai deschidem singuri fereastra; salvat în localStorage. */
  snoozedUntil: number | null;
  lastCheckedAt: number | null;
  error: string | null;
  downloadedInstallerPath: string | null;
  installedContentIds: string[];
  contentInstalling: string | null;
  showUpdateModal: boolean;
  setLocalVersion: (version: string) => void;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  snoozeUntilTonight: () => void;
  dismiss: () => void;
  markContentInstalled: (id: string) => void;
  setContentInstalling: (id: string | null) => void;
  /** `manual: true` = deschis de utilizator (buton); fără el, deschiderea automată respectă „Amână până diseară”. */
  setShowUpdateModal: (value: boolean, opts?: { manual?: boolean }) => void;
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

const BACKUP_WARNING = 'Nu am putut salva o copie a datelor înainte de actualizare. Actualizarea continuă; datele tale rămân pe disc.';

/**
 * Copia „pre-update”: forțată, în același folder cu cele zilnice, dar cu propria rotație.
 * Nu aruncă niciodată; la eșec arată un avertisment și lasă actualizarea să continue.
 */
export async function backupBeforeUpdate(knownVersion?: string): Promise<boolean> {
  const electron = api();
  if (!electron?.autoBackup) return true; // nu e Electron: nu există ce salva
  try {
    const profileId = useUserStore.getState().activeProfileId;
    if (!profileId) return true; // nu e niciun profil activ, nu avem date de copiat
    const version = knownVersion && knownVersion !== '-' ? knownVersion : await resolveAppVersion();
    const result = await electron.autoBackup(buildBackupPayload(profileId, version), 'pre-update');
    if (result?.success) return true;
    throw new Error(result?.error ?? 'copia nu a fost scrisă');
  } catch (err: unknown) {
    console.warn('[StudyX] Copia dinainte de actualizare a eșuat', err);
    useToastStore.getState().addToast(BACKUP_WARNING, 'warning', 6000);
    // o clipă ca avertismentul să se vadă înainte să se închidă aplicația
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return false;
  }
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  localVersion: '-',
  manifest: null,
  downloadPercent: 0,
  downloadStats: EMPTY_DOWNLOAD_STATS,
  errorStage: null,
  snoozedUntil: loadSnoozeUntil(),
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

    set({ status: 'checking', error: null, errorStage: null });

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
        errorStage: 'check',
        lastCheckedAt: Date.now(),
        error: err instanceof Error ? err.message : 'Eroare necunoscută',
      });
    }
  },

  downloadUpdate: async () => {
    const { manifest } = get();
    const electron = api();
    if (!manifest || !electron?.updaterDownload) return;

    set({
      status: 'downloading', downloadPercent: 0, downloadStats: EMPTY_DOWNLOAD_STATS,
      error: null, errorStage: null, downloadedInstallerPath: null,
    });

    const tracker = createSpeedTracker();
    let unsubscribe: (() => void) | null = null;
    if (electron.onUpdateProgress) {
      unsubscribe = electron.onUpdateProgress((data: { percent: number; received?: number; total?: number }) => {
        set({
          downloadPercent: data.percent,
          downloadStats: tracker.update(data.received ?? 0, data.total ?? 0, Date.now()),
        });
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
      set({ status: 'error', errorStage: 'download', error: err instanceof Error ? err.message : 'Descărcarea a eșuat' });
    } finally {
      unsubscribe?.();
    }
  },

  applyUpdate: async () => {
    const electron = api();
    const { manifest, downloadedInstallerPath } = get();
    const fail = (message: string) => set({ status: 'error', errorStage: 'install', error: message });

    // Copie de siguranță a datelor, forțată (ignoră intervalul de 24 h), înainte de orice instalare.
    // Dacă eșuează, avertizăm, dar nu blocăm actualizarea.
    await backupBeforeUpdate(get().localVersion);

    if (manifest?.delivery === 'native') {
      if (!electron?.updaterInstallDownloaded) {
        fail('Actualizarea nativă nu este pregătită.');
        return;
      }
      electron.updaterInstallDownloaded().catch((err: unknown) => {
        fail(err instanceof Error ? err.message : 'Actualizarea nu a putut fi aplicată.');
      });
      return;
    }

    if (manifest?.delivery === 'installer') {
      if (!downloadedInstallerPath || !electron?.updaterInstallDownloaded) {
        fail('Programul de instalare nu este pregătit pentru lansare.');
        return;
      }
      electron.updaterInstallDownloaded(downloadedInstallerPath).catch((err: unknown) => {
        fail(err instanceof Error ? err.message : 'Programul de instalare nu a putut fi lansat.');
      });
      return;
    }

    if (!electron?.updaterRestart) {
      fail('Repornire imposibilă - redeschide aplicația manual.');
      return;
    }
    electron.updaterRestart();
  },

  snoozeUntilTonight: () => {
    const until = snoozeUntilTonight(Date.now());
    persistSnoozeUntil(until);
    set({ snoozedUntil: until, showUpdateModal: false });
  },

  dismiss: () => set({ status: 'idle', error: null, errorStage: null, manifest: null, downloadedInstallerPath: null, downloadStats: EMPTY_DOWNLOAD_STATS }),

  markContentInstalled: (id) => {
    const next = [...new Set([...get().installedContentIds, id])];
    persistInstalledIds(next);
    set({ installedContentIds: next });
  },

  setContentInstalling: (id) => set({ contentInstalling: id }),

  setShowUpdateModal: (value, opts) => {
    if (value && !opts?.manual && isSnoozed(get().snoozedUntil, Date.now())) return;
    set({ showUpdateModal: value });
    if (value && get().status === 'idle') {
      void get().checkForUpdate();
    }
  },
}));
