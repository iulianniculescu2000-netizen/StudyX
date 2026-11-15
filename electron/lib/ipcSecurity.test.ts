import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const { isTrustedSender } = require('./validate.cjs');
const { createSecureIpc } = require('./secureIpc.cjs');
const {
  resolveReadableFile, parseBooleanArg, parseSaveArgs, parseAutoBackupArgs,
  PDF_EXTS, DOCX_EXTS, IMAGE_EXTS, MAX_PDF_BYTES, MAX_DOCX_BYTES, MAX_IMAGE_BYTES,
} = require('./ipcArgs.cjs');

const APP_DIST = path.join(os.tmpdir(), 'studyx-app', 'dist');
const OVERLAY_DIST = path.join(os.tmpdir(), 'studyx-userdata', 'app-overlay', 'files', 'dist');

function makeCtx(overrides: Record<string, unknown> = {}) {
  const mainFrame = { url: '', parent: null };
  const win = { isDestroyed: () => false, webContents: { mainFrame } };
  return {
    mainFrame,
    ctx: {
      getMainWindow: () => win,
      appRoots: [APP_DIST, OVERLAY_DIST],
      devUrl: 'http://localhost:5185',
      isDev: true,
      ...overrides,
    },
  };
}

function eventFor(mainFrame: { url: string; parent: unknown }, url: string, extra: Record<string, unknown> = {}) {
  mainFrame.url = url;
  return { senderFrame: mainFrame, ...extra };
}

describe('isTrustedSender', () => {
  it('acceptă pagina serverului de dezvoltare (dev)', () => {
    const { ctx, mainFrame } = makeCtx();
    expect(isTrustedSender(eventFor(mainFrame, 'http://localhost:5185/#/quiz'), ctx)).toBe(true);
  });

  it('acceptă pagina file:// din dist-ul aplicației și din overlay', () => {
    const { ctx, mainFrame } = makeCtx({ isDev: false });
    expect(isTrustedSender(eventFor(mainFrame, `${pathToFileURL(path.join(APP_DIST, 'index.html')).href}#/home`), ctx)).toBe(true);
    expect(isTrustedSender(eventFor(mainFrame, pathToFileURL(path.join(OVERLAY_DIST, 'index.html')).href), ctx)).toBe(true);
  });

  it('respinge un site extern', () => {
    const { ctx, mainFrame } = makeCtx();
    expect(isTrustedSender(eventFor(mainFrame, 'https://evil.example/'), ctx)).toBe(false);
    expect(isTrustedSender(eventFor(mainFrame, 'http://localhost:5173/'), ctx)).toBe(false);
    expect(isTrustedSender(eventFor(mainFrame, 'http://localhost:5185.evil.example/'), ctx)).toBe(false);
  });

  it('respinge data: și about:blank', () => {
    const { ctx, mainFrame } = makeCtx();
    expect(isTrustedSender(eventFor(mainFrame, 'data:text/html,<h1>x</h1>'), ctx)).toBe(false);
    expect(isTrustedSender(eventFor(mainFrame, 'about:blank'), ctx)).toBe(false);
  });

  it('respinge lipsa cadrului sau a evenimentului', () => {
    const { ctx } = makeCtx();
    expect(isTrustedSender({}, ctx)).toBe(false);
    expect(isTrustedSender({ senderFrame: null }, ctx)).toBe(false);
    expect(isTrustedSender(undefined, ctx)).toBe(false);
  });

  it('respinge un file:// din afara aplicației (inclusiv folder cu prefix asemănător)', () => {
    const { ctx, mainFrame } = makeCtx({ isDev: false });
    expect(isTrustedSender(eventFor(mainFrame, pathToFileURL(path.join(os.tmpdir(), 'altceva', 'index.html')).href), ctx)).toBe(false);
    expect(isTrustedSender(eventFor(mainFrame, pathToFileURL(`${APP_DIST}-evil`).href + '/index.html'), ctx)).toBe(false);
  });

  it('respinge un cadru care nu e cel de sus (iframe) sau nu e cadrul ferestrei principale', () => {
    const { ctx, mainFrame } = makeCtx();
    const child = { url: 'http://localhost:5185/', parent: mainFrame };
    expect(isTrustedSender({ senderFrame: child }, ctx)).toBe(false);
    const foreign = { url: 'http://localhost:5185/', parent: null };
    expect(isTrustedSender({ senderFrame: foreign }, ctx)).toBe(false);
  });

  it('respinge originea de dezvoltare când aplicația e împachetată, și fereastra lipsă/distrusă', () => {
    const packaged = makeCtx({ isDev: false });
    expect(isTrustedSender(eventFor(packaged.mainFrame, 'http://localhost:5185/'), packaged.ctx)).toBe(false);
    const gone = makeCtx({ getMainWindow: () => null });
    expect(isTrustedSender(eventFor(gone.mainFrame, 'http://localhost:5185/'), gone.ctx)).toBe(false);
    const { ctx, mainFrame } = makeCtx();
    const destroyed = { ...ctx, getMainWindow: () => ({ isDestroyed: () => true, webContents: { mainFrame } }) };
    expect(isTrustedSender(eventFor(mainFrame, 'http://localhost:5185/'), destroyed)).toBe(false);
  });
});

describe('createSecureIpc', () => {
  function fakeIpc() {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    const listeners = new Map<string, (...a: unknown[]) => unknown>();
    return {
      handlers,
      listeners,
      handle: (c: string, fn: (...a: unknown[]) => unknown) => handlers.set(c, fn),
      on: (c: string, fn: (...a: unknown[]) => unknown) => listeners.set(c, fn),
      removeListener: (c: string) => listeners.delete(c),
      removeHandler: (c: string) => handlers.delete(c),
    };
  }

  it('handle: respinge neîncrezătorul fără să ruleze handlerul și loghează o singură dată, fără conținut', async () => {
    const raw = fakeIpc();
    const warn = vi.fn();
    const secure = createSecureIpc(raw, (e: { ok?: boolean }) => Boolean(e.ok), warn);
    const handler = vi.fn(() => 'rezultat');
    secure.handle('storage:load', handler);
    await expect(Promise.resolve().then(() => raw.handlers.get('storage:load')!({ ok: false }, { secret: 'PAYLOAD-SECRET' }))).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('storage:load');
    expect(String(warn.mock.calls[0][0])).not.toContain('PAYLOAD-SECRET');
  });

  it('handle: trece neschimbat apelul de încredere (argumente și rezultat)', async () => {
    const raw = fakeIpc();
    const secure = createSecureIpc(raw, () => true, vi.fn());
    const handler = vi.fn((_e: unknown, a: number, b: number) => a + b);
    secure.handle('x', handler);
    expect(await raw.handlers.get('x')!({ ok: true }, 2, 3)).toBe(5);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('on: ignoră neîncrezătorul, rulează încrezătorul; once nu se consumă la un apel respins', () => {
    const raw = fakeIpc();
    let trusted = false;
    const warn = vi.fn();
    const secure = createSecureIpc(raw, () => trusted, warn);
    const onFn = vi.fn();
    const onceFn = vi.fn();
    secure.on('win:minimize', onFn);
    secure.once('app:ready', onceFn);
    raw.listeners.get('win:minimize')!({}, 1);
    raw.listeners.get('app:ready')!({});
    expect(onFn).not.toHaveBeenCalled();
    expect(onceFn).not.toHaveBeenCalled();
    expect(raw.listeners.has('app:ready')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    trusted = true;
    raw.listeners.get('win:minimize')!({}, 1);
    raw.listeners.get('app:ready')!({});
    expect(onFn).toHaveBeenCalledTimes(1);
    expect(onceFn).toHaveBeenCalledTimes(1);
    expect(raw.listeners.has('app:ready')).toBe(false);
  });

  it('un verificator care aruncă înseamnă respingere', async () => {
    const raw = fakeIpc();
    const secure = createSecureIpc(raw, () => { throw new Error('boom'); }, vi.fn());
    const handler = vi.fn();
    secure.handle('x', handler);
    await expect(Promise.resolve().then(() => raw.handlers.get('x')!({}))).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('ipcArgs', () => {
  let dir = '';
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-ipcargs-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('resolveReadableFile: acceptă un fișier obișnuit cu extensie permisă (indiferent de majuscule)', async () => {
    const f = path.join(dir, 'Carte.PDF');
    fs.writeFileSync(f, 'x');
    expect(await resolveReadableFile(f, { exts: PDF_EXTS, maxBytes: MAX_PDF_BYTES })).toBe(f);
  });

  it('resolveReadableFile: respinge null, nu-șir, gol, relativ, extensie greșită, inexistent, folder', async () => {
    const opts = { exts: PDF_EXTS, maxBytes: MAX_PDF_BYTES };
    for (const bad of [null, undefined, 42, {}, '', '   ', 'carte.pdf', './carte.pdf', `${dir}${path.sep}x.txt`, path.join(dir, 'lipsa.pdf'), 'a\0.pdf']) {
      expect(await resolveReadableFile(bad, opts)).toBeNull();
    }
    const folderPdf = path.join(dir, 'folder.pdf');
    fs.mkdirSync(folderPdf);
    expect(await resolveReadableFile(folderPdf, opts)).toBeNull();
  });

  it('resolveReadableFile: respectă plafonul de dimensiune (fs injectat)', async () => {
    const fakeFs = { stat: async () => ({ isFile: () => true, size: 101 }) };
    const f = path.join(dir, 'a.docx');
    expect(await resolveReadableFile(f, { exts: DOCX_EXTS, maxBytes: 100 }, fakeFs)).toBeNull();
    expect(await resolveReadableFile(f, { exts: DOCX_EXTS, maxBytes: 101 }, fakeFs)).toBe(f);
  });

  it('plafoanele: pdf ≥ 300 MB, docx și imagini 100 MB; imaginile acceptă doar formatele OCR', () => {
    expect(MAX_PDF_BYTES).toBeGreaterThanOrEqual(300 * 1024 * 1024);
    expect(MAX_DOCX_BYTES).toBe(100 * 1024 * 1024);
    expect(MAX_IMAGE_BYTES).toBe(100 * 1024 * 1024);
    expect(IMAGE_EXTS).toEqual(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
  });

  it('parseBooleanArg: doar boolean', () => {
    expect(parseBooleanArg(true)).toBe(true);
    expect(parseBooleanArg(false)).toBe(false);
    for (const bad of [1, 0, 'true', null, undefined, {}]) expect(parseBooleanArg(bad)).toBeNull();
  });

  it('parseSaveArgs: valori implicite sensibile în loc de TypeError', () => {
    expect(parseSaveArgs(null)).toBeNull();
    expect(parseSaveArgs(undefined)).toBeNull();
    expect(parseSaveArgs({ content: 5 })).toBeNull();
    expect(parseSaveArgs({ content: 'abc' })).toEqual({ defaultPath: undefined, content: 'abc' });
    expect(parseSaveArgs({ content: 'abc', defaultPath: 'x.json' })).toEqual({ defaultPath: 'x.json', content: 'abc' });
    expect(parseSaveArgs({ content: 'abc', defaultPath: 7 })).toEqual({ defaultPath: undefined, content: 'abc' });
    expect(parseSaveArgs({ content: 'abcd' }, 3)).toBeNull();
  });

  it('parseAutoBackupArgs: tip, mărime, kind', () => {
    expect(parseAutoBackupArgs(null)).toBeNull();
    expect(parseAutoBackupArgs({})).toBeNull();
    expect(parseAutoBackupArgs({ data: 12 })).toBeNull();
    expect(parseAutoBackupArgs({ data: '' })).toBeNull();
    expect(parseAutoBackupArgs({ data: 'abcd' }, 3)).toBeNull();
    expect(parseAutoBackupArgs({ data: '{}' })).toEqual({ data: '{}', kind: 'daily' });
    expect(parseAutoBackupArgs({ data: '{}', kind: 'pre-update' })).toEqual({ data: '{}', kind: 'pre-update' });
    expect(parseAutoBackupArgs({ data: '{}', kind: '../x' })).toEqual({ data: '{}', kind: 'daily' });
  });
});
