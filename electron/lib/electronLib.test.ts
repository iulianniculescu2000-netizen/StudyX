import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { compareVersion, isNewerVersion, parseVersion } = require('./versions.cjs');
const { isPathInside } = require('./paths.cjs');
const { friendlyUpdateError } = require('./updateErrors.cjs');
const { shouldClearStorageOnFirstRun, inspectUserData } = require('./firstRun.cjs');
const { isSafeStorageId } = require('./validate.cjs');

describe('versions', () => {
  it('compară numeric și tolerează sufixe', () => {
    expect(compareVersion('2.3.1', '2.3.2')).toBe(-1);
    expect(compareVersion('v2.10.0', '2.9.9')).toBe(1);
    expect(compareVersion('2.3.2-beta.1', '2.3.2')).toBe(0);
    expect(parseVersion('2.3.x')).toEqual([2, 3, 0]);
    expect(parseVersion(undefined)).toEqual([0, 0, 0]);
    expect(isNewerVersion('2.3.1', '2.3.2-beta')).toBe(true);
    expect(isNewerVersion('2.3.2', '2.3.2')).toBe(false);
  });
});

describe('isPathInside', () => {
  it('acceptă rădăcina și copiii, respinge frații și ..', () => {
    const root = path.resolve('/tmp/studyx/root');
    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(root, path.join(root, 'a', 'b.exe'))).toBe(true);
    expect(isPathInside(root, root + '-evil')).toBe(false);
    expect(isPathInside(root, path.join(root, '..', 'x'))).toBe(false);
  });
});

describe('friendlyUpdateError', () => {
  it('mapează erori tehnice', () => {
    expect(friendlyUpdateError({ code: 'ENOTFOUND' })).toMatch(/conexiunea/);
    expect(friendlyUpdateError({ code: 'EPERM' })).toMatch(/antivirus/);
    expect(friendlyUpdateError({ code: 'ENOSPC' })).toMatch(/spațiu/);
    expect(friendlyUpdateError(new Error('HttpError: 404'))).toMatch(/nu este încă disponibilă/);
    expect(friendlyUpdateError(new Error('sha512 mismatch'))).toMatch(/corupt/);
    expect(friendlyUpdateError(new Error('Serverul a returnat 500'))).toBe('Serverul a returnat 500');
    expect(friendlyUpdateError(new Error('xyz'), 'fb')).toBe('fb');
  });
});

describe('first-run', () => {
  const base = { sentinelExists: false, hasProfileFiles: false, hasOtherUserData: false, hasChromiumStorageData: false };
  it('șterge doar la instalare nouă', () => {
    expect(shouldClearStorageOnFirstRun(base)).toBe(true);
    expect(shouldClearStorageOnFirstRun({ ...base, sentinelExists: true })).toBe(false);
    expect(shouldClearStorageOnFirstRun({ ...base, hasProfileFiles: true })).toBe(false);
    expect(shouldClearStorageOnFirstRun({ ...base, hasOtherUserData: true })).toBe(false);
    expect(shouldClearStorageOnFirstRun({ ...base, hasChromiumStorageData: true })).toBe(false);
    expect(shouldClearStorageOnFirstRun(null)).toBe(false);
  });
  it('inspectUserData detectează date pe disc', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-fr-'));
    try {
      expect(shouldClearStorageOnFirstRun(inspectUserData(dir))).toBe(true);
      fs.mkdirSync(path.join(dir, 'profiles', 'p1'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'profiles', 'p1', 'stats.json'), '{}');
      expect(inspectUserData(dir).hasProfileFiles).toBe(true);
      expect(shouldClearStorageOnFirstRun(inspectUserData(dir))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('localStorage cu conținut blochează ștergerea', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-fr-'));
    try {
      fs.mkdirSync(path.join(dir, 'Local Storage', 'leveldb'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Local Storage', 'leveldb', '000003.log'), 'data');
      expect(shouldClearStorageOnFirstRun(inspectUserData(dir))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('isSafeStorageId', () => {
  it('acceptă orice string rezonabil: caracterele neobișnuite sunt curățate mai departe, nu respinse (date existente)', () => {
    for (const ok of ['abc-123_X', 'ai-store:profil.1', 'a b', '../x']) {
      expect(isSafeStorageId(ok)).toBe(true);
    }
  });

  it('respinge ce nu e string, șirul gol sau prea lung', () => {
    for (const bad of ['', null, undefined, 5, {}, 'x'.repeat(300)]) {
      expect(isSafeStorageId(bad as never)).toBe(false);
    }
  });
});
