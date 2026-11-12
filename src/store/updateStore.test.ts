import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateStore, backupBeforeUpdate } from './updateStore';
import { useUserStore } from './userStore';
import { useToastStore } from './toastStore';
import { UPDATE_SNOOZE_KEY } from '../lib/updateUi';

type Api = Record<string, unknown>;
const w = window as unknown as { electronAPI: Api };
let original: Api;

function installApi(extra: Api) {
  w.electronAPI = { ...original, ...extra };
}

beforeEach(() => {
  original = w.electronAPI;
  localStorage.clear();
  useUserStore.setState({ activeProfileId: 'p1' });
  useToastStore.setState({ toasts: [] } as never);
  useUpdateStore.setState({
    status: 'idle', error: null, errorStage: null, manifest: null, localVersion: '1.1.0',
    downloadedInstallerPath: null, snoozedUntil: null, showUpdateModal: false,
  });
});

afterEach(() => {
  w.electronAPI = original;
  vi.restoreAllMocks();
});

describe('backupBeforeUpdate', () => {
  it('cere copia forțată, de tip pre-update, cu versiunea reală', async () => {
    const autoBackup = vi.fn().mockResolvedValue({ success: true, path: '/x' });
    installApi({ autoBackup });
    expect(await backupBeforeUpdate('1.1.0')).toBe(true);
    expect(autoBackup).toHaveBeenCalledTimes(1);
    const [payload, kind] = autoBackup.mock.calls[0];
    expect(kind).toBe('pre-update');
    const parsed = JSON.parse(payload as string);
    expect(parsed.appVersion).toBe('1.1.0');
    expect(parsed.profileId).toBe('p1');
  });

  it('ignoră intervalul de 24 h al copiei zilnice', async () => {
    localStorage.setItem('studyx-last-auto-backup', String(Date.now()));
    const autoBackup = vi.fn().mockResolvedValue({ success: true });
    installApi({ autoBackup });
    await backupBeforeUpdate('1.1.0');
    expect(autoBackup).toHaveBeenCalledTimes(1);
  });

  it('citește versiunea din aplicație când store-ul nu o are încă', async () => {
    const autoBackup = vi.fn().mockResolvedValue({ success: true });
    installApi({ autoBackup, updaterGetVersion: () => Promise.resolve('1.2.3') });
    await backupBeforeUpdate('-');
    expect(JSON.parse(autoBackup.mock.calls[0][0] as string).appVersion).toBe('1.2.3');
  });

  it('la eșec avertizează și întoarce false, fără să arunce', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    installApi({ autoBackup: vi.fn().mockResolvedValue({ success: false, error: 'disc plin' }) });
    const pending = backupBeforeUpdate('1.1.0');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe(false);
    expect(useToastStore.getState().toasts.some((t) => t.type === 'warning')).toBe(true);
  });
});

describe('applyUpdate', () => {
  it('face copia înainte de a lansa installerul și nu așteaptă după un eșec al copiei', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const order: string[] = [];
    installApi({
      autoBackup: vi.fn().mockImplementation(async () => { order.push('backup'); throw new Error('boom'); }),
      updaterInstallDownloaded: vi.fn().mockImplementation(async () => { order.push('install'); return true; }),
    });
    useUpdateStore.setState({
      manifest: { version: '1.2.0', releaseDate: '', changes: [], files: [], delivery: 'installer' },
      downloadedInstallerPath: 'C:/tmp/setup.exe',
    });
    const pending = useUpdateStore.getState().applyUpdate();
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(order).toEqual(['backup', 'install']);
  });

  it('marchează eroarea de instalare cu etapa ei', async () => {
    installApi({ autoBackup: vi.fn().mockResolvedValue({ success: true }), updaterInstallDownloaded: undefined });
    useUpdateStore.setState({
      manifest: { version: '1.2.0', releaseDate: '', changes: [], files: [], delivery: 'installer' },
      downloadedInstallerPath: null,
    });
    await useUpdateStore.getState().applyUpdate();
    expect(useUpdateStore.getState()).toMatchObject({ status: 'error', errorStage: 'install' });
  });
});

describe('downloadUpdate', () => {
  const manifest = { version: '1.2.0', releaseDate: '', changes: [], files: [], delivery: 'installer' as const };

  it('urmărește mărimea primită și etapa erorii, iar reluarea șterge eroarea', async () => {
    let emit: (d: { percent: number; received?: number; total?: number }) => void = () => {};
    const download = vi.fn()
      .mockImplementationOnce(async () => {
        emit({ percent: 10, received: 1_048_576, total: 10_485_760 });
        throw new Error('Conexiune întreruptă');
      })
      .mockResolvedValueOnce({ mode: 'installer', path: 'C:/tmp/s.exe' });
    installApi({
      updaterDownload: download,
      onUpdateProgress: (cb: typeof emit) => { emit = cb; return () => {}; },
    });
    useUpdateStore.setState({ manifest, status: 'available' });

    await useUpdateStore.getState().downloadUpdate();
    expect(useUpdateStore.getState()).toMatchObject({ status: 'error', errorStage: 'download', error: 'Conexiune întreruptă' });
    expect(useUpdateStore.getState().manifest).not.toBeNull();
    expect(useUpdateStore.getState().downloadStats.total).toBe(10_485_760);

    await useUpdateStore.getState().downloadUpdate();
    expect(useUpdateStore.getState()).toMatchObject({ status: 'ready', errorStage: null, error: null, downloadedInstallerPath: 'C:/tmp/s.exe' });
  });
});

describe('Amână până diseară', () => {
  it('salvează limita, închide fereastra și oprește deschiderea automată', () => {
    useUpdateStore.setState({ showUpdateModal: true });
    useUpdateStore.getState().snoozeUntilTonight();
    const until = useUpdateStore.getState().snoozedUntil;
    expect(until).toBeGreaterThan(Date.now());
    expect(Number(localStorage.getItem(UPDATE_SNOOZE_KEY))).toBe(until);
    expect(useUpdateStore.getState().showUpdateModal).toBe(false);

    useUpdateStore.getState().setShowUpdateModal(true); // automat
    expect(useUpdateStore.getState().showUpdateModal).toBe(false);
  });

  it('deschiderea manuală merge mereu', () => {
    useUpdateStore.setState({ status: 'available' });
    useUpdateStore.getState().snoozeUntilTonight();
    useUpdateStore.getState().setShowUpdateModal(true, { manual: true });
    expect(useUpdateStore.getState().showUpdateModal).toBe(true);
  });

  it('după expirare deschiderea automată merge din nou', () => {
    useUpdateStore.setState({ status: 'available', snoozedUntil: Date.now() - 1000 });
    useUpdateStore.getState().setShowUpdateModal(true);
    expect(useUpdateStore.getState().showUpdateModal).toBe(true);
  });
});
