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
  // Sandboxed Windows hosts may deny even junction creation. Run the remaining
  // path checks there and mark only the filesystem-link scenario unavailable.
  let canCreateLink = false;
  try {
    symlinkSync(outside, path.join(root, 'Carti', 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    canCreateLink = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
  }

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
  it.skipIf(!canCreateLink)('rejects a symlink that leaves the root', async () => {
    expect((await readPdfInsideRoot(root, 'Carti/external/secret.pdf')).code).toBe('invalid');
  });
  it('reports missing files', async () => {
    expect((await readPdfInsideRoot(root, 'Carti/nope.pdf')).code).toBe('missing');
  });
});
