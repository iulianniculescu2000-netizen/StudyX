import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizareStore } from '../store/organizareStore';
import { useToastStore } from '../store/toastStore';
import { ensureMaterialsRoot, shortPath, EXPECTED_BOOK_FILES } from './organizareRoot';

type Api = Record<string, unknown>;
const PROFILE = 'p1';
let resolveRoot: ReturnType<typeof vi.fn>;
let pickRoot: ReturnType<typeof vi.fn>;

const savedRoot = () => useOrganizareStore.getState().byProfile[PROFILE]?.root ?? null;
const toasts = () => useToastStore.getState().toasts.map((t) => `${t.type}:${t.message}`);

beforeEach(() => {
  useOrganizareStore.setState({ byProfile: {} });
  useToastStore.setState({ toasts: [] });
  resolveRoot = vi.fn();
  pickRoot = vi.fn();
  Object.assign(window.electronAPI as unknown as Api, { organizareResolveRoot: resolveRoot, organizarePickRoot: pickRoot });
});

afterEach(() => {
  delete (window.electronAPI as unknown as Api).organizareResolveRoot;
  delete (window.electronAPI as unknown as Api).organizarePickRoot;
});

describe('ensureMaterialsRoot', () => {
  it('un folder salvat corect rămâne, fără mesaje', async () => {
    useOrganizareStore.getState().setRoot(PROFILE, 'C:/Desktop/Rezidentiat');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/Desktop/Rezidentiat', via: 'same' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBe('C:/Desktop/Rezidentiat');
    expect(pickRoot).not.toHaveBeenCalled();
    expect(toasts()).toEqual([]);
  });

  it('un folder salvat greșit (subfolder/părinte) se corectează singur și se spune asta', async () => {
    useOrganizareStore.getState().setRoot(PROFILE, 'C:/Desktop/Rezidentiat/Carti');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/Desktop/Rezidentiat', via: 'parent' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBe('C:/Desktop/Rezidentiat');
    expect(savedRoot()).toBe('C:/Desktop/Rezidentiat');
    expect(pickRoot).not.toHaveBeenCalled();
    expect(toasts()[0]).toContain('info:Am găsit materialele în „Desktop\\Rezidentiat”');
  });

  it('cere lista de cărți așteptate la rezolvare', async () => {
    useOrganizareStore.getState().setRoot(PROFILE, 'C:/x');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/x' });
    await ensureMaterialsRoot(PROFILE, { pickIfMissing: false });
    expect(resolveRoot).toHaveBeenCalledWith('C:/x', EXPECTED_BOOK_FILES);
    expect(EXPECTED_BOOK_FILES.length).toBe(3);
  });

  it('fără folder salvat: cere alegerea, apoi corectează alegerea', async () => {
    pickRoot.mockResolvedValue('C:/Desktop');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/Desktop/Rezidentiat', via: 'child' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBe('C:/Desktop/Rezidentiat');
    expect(savedRoot()).toBe('C:/Desktop/Rezidentiat');
    expect(toasts()[0]).toContain('Am găsit materialele');
  });

  it('alegerea anulată: nimic nu se schimbă', async () => {
    pickRoot.mockResolvedValue(null);
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBeNull();
    expect(savedRoot()).toBeNull();
    expect(toasts()).toEqual([]);
  });

  it('folder ales fără Carti/Capitole: se păstrează, se avertizează și se întoarce null', async () => {
    pickRoot.mockResolvedValue('C:/Altceva');
    resolveRoot.mockResolvedValue({ ok: false, code: 'not-found' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBeNull();
    expect(savedRoot()).toBe('C:/Altceva');
    expect(toasts()[0]).toContain('warning:');
    expect(toasts()[0]).toContain('Carti');
  });

  it('forcePick ignoră folderul salvat și cere alegerea', async () => {
    useOrganizareStore.getState().setRoot(PROFILE, 'C:/Vechi');
    pickRoot.mockResolvedValue('C:/Nou');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/Nou' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true, forcePick: true })).toBe('C:/Nou');
    expect(resolveRoot).toHaveBeenCalledTimes(1);
    expect(resolveRoot).toHaveBeenCalledWith('C:/Nou', EXPECTED_BOOK_FILES);
  });

  it('folderul salvat nu se mai găsește: nu cere alegerea dacă nu e permis', async () => {
    useOrganizareStore.getState().setRoot(PROFILE, 'C:/Disparut');
    resolveRoot.mockResolvedValue({ ok: false, code: 'missing' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: false })).toBeNull();
    expect(pickRoot).not.toHaveBeenCalled();
  });

  it('fără punte (varianta web) nu face nimic', async () => {
    delete (window.electronAPI as unknown as Api).organizareResolveRoot;
    delete (window.electronAPI as unknown as Api).organizarePickRoot;
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBeNull();
  });
});

describe('shortPath', () => {
  it('ultimele două părți ale căii', () => {
    expect(shortPath('C:\\Users\\Iulia\\Desktop\\Rezidentiat')).toBe('Desktop\\Rezidentiat');
    expect(shortPath('/home/ana/materiale')).toBe('ana\\materiale');
  });
});

describe('ensureMaterialsRoot: detecție și folder salvat pe disc', () => {
  let detectRoot: ReturnType<typeof vi.fn>;
  let rootGet: ReturnType<typeof vi.fn>;
  let rootSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    detectRoot = vi.fn().mockResolvedValue({ ok: false, code: 'not-found' });
    rootGet = vi.fn().mockResolvedValue(null);
    rootSet = vi.fn().mockResolvedValue(true);
    Object.assign(window.electronAPI as unknown as Api, { organizareDetectRoot: detectRoot, organizareRootGet: rootGet, organizareRootSet: rootSet });
  });

  afterEach(() => {
    for (const key of ['organizareDetectRoot', 'organizareRootGet', 'organizareRootSet']) delete (window.electronAPI as unknown as Api)[key];
  });

  it('fără nimic salvat își găsește singur folderul, fără dialog', async () => {
    detectRoot.mockResolvedValue({ ok: true, root: 'C:/Desktop/Rezidentiat', books: 3, hasCapitole: true });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBe('C:/Desktop/Rezidentiat');
    expect(pickRoot).not.toHaveBeenCalled();
    expect(savedRoot()).toBe('C:/Desktop/Rezidentiat');
    expect(rootSet).toHaveBeenCalledWith(PROFILE, 'C:/Desktop/Rezidentiat');
    expect(toasts()[0]).toContain('Am găsit materialele');
    expect(detectRoot).toHaveBeenCalledWith(EXPECTED_BOOK_FILES);
  });

  it('folderul salvat pe disc se folosește când pagina nu are unul (aplicația instalată vs start.bat)', async () => {
    rootGet.mockResolvedValue('C:/Desktop/Rezidentiat');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/Desktop/Rezidentiat', via: 'same' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBe('C:/Desktop/Rezidentiat');
    expect(rootGet).toHaveBeenCalledWith(PROFILE);
    expect(detectRoot).not.toHaveBeenCalled();
    expect(savedRoot()).toBe('C:/Desktop/Rezidentiat');
    expect(toasts()).toEqual([]);
  });

  it('salvatul nu mai e bun: detecția îl înlocuiește, fără să ceară nimic', async () => {
    useOrganizareStore.getState().setRoot(PROFILE, 'C:/Vechi');
    resolveRoot.mockResolvedValue({ ok: false, code: 'not-found' });
    detectRoot.mockResolvedValue({ ok: true, root: 'C:/Desktop/Rezidentiat' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBe('C:/Desktop/Rezidentiat');
    expect(pickRoot).not.toHaveBeenCalled();
    expect(savedRoot()).toBe('C:/Desktop/Rezidentiat');
  });

  it('detecția nu găsește nimic: abia atunci cere alegerea', async () => {
    pickRoot.mockResolvedValue('C:/Ales');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/Ales' });
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: true })).toBe('C:/Ales');
    expect(detectRoot).toHaveBeenCalledTimes(1);
    expect(pickRoot).toHaveBeenCalledTimes(1);
    expect(rootSet).toHaveBeenCalledWith(PROFILE, 'C:/Ales');
  });

  it('pickIfMissing:false nu deschide niciodată dialogul, dar tot detectează', async () => {
    expect(await ensureMaterialsRoot(PROFILE, { pickIfMissing: false })).toBeNull();
    expect(detectRoot).toHaveBeenCalledTimes(1);
    expect(pickRoot).not.toHaveBeenCalled();
  });

  it('forcePick nu detectează și nu citește de pe disc', async () => {
    pickRoot.mockResolvedValue('C:/Nou');
    resolveRoot.mockResolvedValue({ ok: true, root: 'C:/Nou' });
    await ensureMaterialsRoot(PROFILE, { pickIfMissing: true, forcePick: true });
    expect(detectRoot).not.toHaveBeenCalled();
    expect(rootGet).not.toHaveBeenCalled();
  });
});
