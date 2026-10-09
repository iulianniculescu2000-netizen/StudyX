/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Node-only test of electron/organizare.cjs (the app tsconfig has no Node types).
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readPdfInsideRoot, resolvePdfInsideRoot } = require('../../electron/organizare.cjs') as {
  readPdfInsideRoot: (root: string, rel: string) => Promise<{ ok: boolean; code?: string; data?: Uint8Array }>;
  resolvePdfInsideRoot: (root: string, rel: string) => string | null;
};

describe('organizare:read-pdf validation', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'studyx-root-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'studyx-out-'));
  mkdirSync(path.join(root, 'Carti'));
  writeFileSync(path.join(root, 'Carti', 'a.pdf'), '%PDF-1.4 test');
  writeFileSync(path.join(root, 'Carti', 'a.txt'), 'x');
  writeFileSync(path.join(outside, 'secret.pdf'), 'secret');
  symlinkSync(path.join(outside, 'secret.pdf'), path.join(root, 'Carti', 'link.pdf'));

  it('reads a pdf inside the root', async () => {
    const r = await readPdfInsideRoot(root, 'Carti/a.pdf');
    expect(r.ok).toBe(true);
    expect(new TextDecoder().decode(r.data!)).toBe('%PDF-1.4 test');
  });
  it('rejects traversal, other extensions and bad input', async () => {
    expect(resolvePdfInsideRoot(root, '../x.pdf')).toBeNull();
    expect(resolvePdfInsideRoot(root, 'Carti/a.txt')).toBeNull();
    expect((await readPdfInsideRoot(root, '../' + path.basename(outside) + '/secret.pdf')).code).toBe('invalid');
    expect((await readPdfInsideRoot(root, 'Carti/a.txt')).code).toBe('invalid');
    expect((await readPdfInsideRoot('', 'a.pdf')).ok).toBe(false);
    expect((await readPdfInsideRoot(root, undefined as never)).ok).toBe(false);
  });
  it('rejects a symlink that leaves the root and reports missing files', async () => {
    expect((await readPdfInsideRoot(root, 'Carti/link.pdf')).code).toBe('invalid');
    expect((await readPdfInsideRoot(root, 'Carti/nope.pdf')).code).toBe('missing');
  });
});
