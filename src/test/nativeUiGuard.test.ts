/**
 * Elementele native ale sistemului (dialogul `window.confirm`, lista `<select>`) arată străin față de restul aplicației.
 * Folosește `ConfirmDialog` și `ThemedSelect`. Tooltipurile `title=` sunt preluate global de `TitleTooltips`.
 */
// @ts-expect-error tipurile `node` nu sunt în tsconfig.app (vezi docs/HANDOFF.md)
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-expect-error idem
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('fără elemente native nearmonizate', () => {
  const files = walk(SRC);

  it('niciun window.confirm / alert / prompt', () => {
    const offenders = files.filter((file) => /window\.(confirm|alert|prompt)\(/.test(readFileSync(file, 'utf8'))).map((f: string) => f.replace(SRC, 'src'));
    expect(offenders).toEqual([]);
  });

  it('<select> nativ doar în ThemedSelect', () => {
    const offenders = files
      .filter((file: string) => !file.endsWith('ThemedSelect.tsx'))
      .filter((file: string) => /<select[\s>]/.test(readFileSync(file, 'utf8')))
      .map((f: string) => f.replace(SRC, 'src'));
    expect(offenders).toEqual([]);
  });
});
