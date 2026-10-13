import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { checkRelease, parseLatestYml } = createRequire(import.meta.url)('../../scripts/lib/releaseChecks.cjs') as {
  checkRelease: (opts: { root: string; releaseDir?: string }) => { errors: string[]; warnings: string[] };
  parseLatestYml: (text: string) => Record<string, string>;
};

let root = '';
let releaseDir = '';
const INSTALLER = Buffer.from('installer-bytes');
const sha = (buffer: Buffer) => createHash('sha512').update(buffer).digest('base64');

function project(version: string, files: { manifest?: string; lock?: string } = {}) {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version, build: { publish: [{ provider: 'github', repo: 'studyx-releases' }] } }));
  writeFileSync(join(root, 'version.json'), JSON.stringify({ version: files.manifest ?? version, manifestUrl: `https://example.test/manifests/${files.manifest ?? version}.json` }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version: files.lock ?? version, packages: { '': { version: files.lock ?? version } } }));
}
function release(version: string, yml?: Partial<{ version: string; path: string; sha512: string }>) {
  writeFileSync(join(releaseDir, `StudyX-Setup-${version}.exe`), INSTALLER);
  writeFileSync(join(releaseDir, `StudyX-Setup-${version}.exe.blockmap`), 'map');
  writeFileSync(join(releaseDir, 'latest.yml'), [
    `version: ${yml?.version ?? version}`,
    'files:',
    `  - url: StudyX-Setup-${version}.exe`,
    `    sha512: ${yml?.sha512 ?? sha(INSTALLER)}`,
    `path: ${yml?.path ?? `StudyX-Setup-${version}.exe`}`,
    `sha512: ${yml?.sha512 ?? sha(INSTALLER)}`,
  ].join('\n'));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'studyx-guard-'));
  releaseDir = join(root, 'release');
  mkdirSync(releaseDir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('checkRelease', () => {
  it('acceptă o lansare coerentă', () => {
    project('1.1.0');
    release('1.1.0');
    expect(checkRelease({ root, releaseDir })).toMatchObject({ errors: [], warnings: [] });
  });

  it('refuză când installerul versiunii curente lipsește, chiar dacă există unul vechi', () => {
    project('1.1.0');
    release('1.0.0');
    const { errors, warnings } = checkRelease({ root, releaseDir });
    expect(errors.join('\n')).toContain('Lipsește StudyX-Setup-1.1.0.exe');
    expect(errors.join('\n')).toContain('latest.yml are versiunea 1.0.0');
    expect(warnings.join('\n')).toContain('StudyX-Setup-1.0.0.exe');
  });

  it('prinde versiuni care nu se potrivesc între fișiere', () => {
    project('1.1.0', { manifest: '1.0.0', lock: '1.0.0' });
    release('1.1.0');
    const text = checkRelease({ root, releaseDir }).errors.join('\n');
    expect(text).toContain('version.json are 1.0.0');
    expect(text).toContain('manifestUrl');
    expect(text).toContain('package-lock.json');
  });

  it('prinde un installer schimbat după build (hash diferit în latest.yml)', () => {
    project('1.1.0');
    release('1.1.0', { sha512: sha(Buffer.from('altceva')) });
    expect(checkRelease({ root, releaseDir }).errors.join('\n')).toContain('Hash-ul din latest.yml');
  });

  it('refuză o versiune cu patru segmente', () => {
    project('1.1.0.1');
    release('1.1.0.1');
    expect(checkRelease({ root, releaseDir }).errors.join('\n')).toContain('trei segmente');
  });
});

describe('parseLatestYml', () => {
  it('ia versiunea, calea și hash-ul de la rădăcină, nu cele din lista de fișiere', () => {
    const parsed = parseLatestYml('version: 1.1.0\nfiles:\n  - url: a.exe\n    sha512: PRIMUL\npath: a.exe\nsha512: AL-DOILEA\n');
    expect(parsed).toEqual({ version: '1.1.0', path: 'a.exe', sha512: 'AL-DOILEA' });
  });
});
