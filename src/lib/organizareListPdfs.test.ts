/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Node-only test of electron/organizare.cjs (the app tsconfig has no Node types).
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { listPdfsInsideRoot } = require('../../electron/organizare.cjs') as {
  listPdfsInsideRoot: (root: string, sub?: string) => Promise<{ ok: boolean; code?: string; files?: Array<{ relPath: string; size: number }> }>;
};

describe('organizare:list-pdfs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'studyx-list-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'studyx-list-out-'));
  mkdirSync(path.join(root, 'Capitole', 'ATI', 'Sepsis'), { recursive: true });
  mkdirSync(path.join(root, 'Carti'));
  writeFileSync(path.join(root, 'Capitole', 'ATI', 'Sepsis', 'b.pdf'), '%PDF');
  writeFileSync(path.join(root, 'Capitole', 'ATI', 'a.PDF'), '%PDF-1');
  writeFileSync(path.join(root, 'Capitole', 'ATI', 'note.docx'), 'x');
  writeFileSync(path.join(root, 'Carti', 'carte.pdf'), '%PDF');
  writeFileSync(path.join(outside, 'secret.pdf'), 'secret');
  // Pe Windows fără privilegiu de symlink legătura nu se poate crea; restul testului rămâne valabil.
  try { symlinkSync(path.join(outside, 'secret.pdf'), path.join(root, 'Capitole', 'ATI', 'link.pdf')); } catch { /* skip */ }

  it('listează doar PDF-urile din Capitole, cu cale relativă „/”, fără legături simbolice', async () => {
    const r = await listPdfsInsideRoot(root);
    expect(r.ok).toBe(true);
    expect(r.files!.map((x) => x.relPath)).toEqual(['Capitole/ATI/a.PDF', 'Capitole/ATI/Sepsis/b.pdf']);
    expect(r.files![0].size).toBe(6);
  });
  it('refuză ieșirea din folder și raportează folderul lipsă', async () => {
    expect((await listPdfsInsideRoot(root, '../' + path.basename(outside))).code).toBe('invalid');
    expect((await listPdfsInsideRoot(root, 'Nu exista')).code).toBe('missing');
    expect((await listPdfsInsideRoot('')).ok).toBe(false);
  });
});
