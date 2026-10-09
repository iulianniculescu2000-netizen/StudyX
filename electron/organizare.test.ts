import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { registerOrganizareIPC, readRoots } = require('./organizare.cjs');

type Handler = (event: unknown, payload?: unknown) => Promise<unknown> | unknown;

describe('organizare IPC: folderul cu materialele pe disc și corectarea lui', () => {
  let userData = '';
  let tree = '';
  const handlers = new Map<string, Handler>();
  const call = (channel: string, payload?: unknown) => Promise.resolve(handlers.get(channel)!({}, payload));

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-ud-'));
    tree = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-tree-'));
    handlers.clear();
    const ipcMain = { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) };
    registerOrganizareIPC({ ipcMain, dialog: {}, shell: {}, getWindow: () => null, userDataDir: userData });
    fs.mkdirSync(path.join(tree, 'Rezidentiat', 'Carti', 'Kumar'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'Rezidentiat', 'Carti', 'Kumar', 'k.pdf'), 'x');
    fs.mkdirSync(path.join(tree, 'Rezidentiat', 'Capitole'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(tree, { recursive: true, force: true });
  });

  it('înregistrează canalele noi', () => {
    for (const ch of ['organizare:resolve-root', 'organizare:detect-root', 'organizare:root-get', 'organizare:root-set']) expect(handlers.has(ch), ch).toBe(true);
  });

  it('salvează și citește folderul pe profil, în userData', async () => {
    const root = path.join(tree, 'Rezidentiat');
    expect(await call('organizare:root-get', { profileId: 'p1' })).toBeNull();
    expect(await call('organizare:root-set', { profileId: 'p1', root })).toBe(true);
    expect(await call('organizare:root-set', { profileId: 'p2', root: path.join(tree, 'altul') })).toBe(true);
    expect(await call('organizare:root-get', { profileId: 'p1' })).toBe(root);
    expect(readRoots(userData)).toMatchObject({ p1: root });
    // Fiecare profil își are folderul lui.
    expect(await call('organizare:root-get', { profileId: 'p2' })).toBe(path.join(tree, 'altul'));
  });

  it('null șterge folderul profilului', async () => {
    const root = path.join(tree, 'Rezidentiat');
    await call('organizare:root-set', { profileId: 'p1', root });
    expect(await call('organizare:root-set', { profileId: 'p1', root: null })).toBe(true);
    expect(await call('organizare:root-get', { profileId: 'p1' })).toBeNull();
  });

  it('respinge profil nevalid și cale relativă sau de alt tip', async () => {
    expect(await call('organizare:root-set', { profileId: '', root: path.join(tree, 'x') })).toBe(false);
    expect(await call('organizare:root-set', { profileId: 'p1', root: 'relativ/cale' })).toBe(false);
    expect(await call('organizare:root-set', { profileId: 'p1', root: 42 })).toBe(false);
    expect(await call('organizare:root-set', undefined)).toBe(false);
    expect(await call('organizare:root-get', { profileId: 5 })).toBeNull();
    expect(readRoots(userData)).toEqual({});
  });

  it('un fișier stricat în userData nu strică nimic', async () => {
    fs.writeFileSync(path.join(userData, 'organizare-roots.json'), '{nu e json');
    expect(await call('organizare:root-get', { profileId: 'p1' })).toBeNull();
    expect(await call('organizare:root-set', { profileId: 'p1', root: path.join(tree, 'Rezidentiat') })).toBe(true);
    expect(await call('organizare:root-get', { profileId: 'p1' })).toBe(path.join(tree, 'Rezidentiat'));
  });

  it('resolve-root corectează un subfolder către folderul cu Carti/Capitole', async () => {
    const res = (await call('organizare:resolve-root', { root: path.join(tree, 'Rezidentiat', 'Carti'), expected: ['Carti/Kumar/k.pdf'] })) as { ok: boolean; root: string; via: string };
    expect(res).toMatchObject({ ok: true, root: path.join(tree, 'Rezidentiat'), via: 'parent' });
  });
});
