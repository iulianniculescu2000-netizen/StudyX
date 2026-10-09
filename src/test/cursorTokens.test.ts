/**
 * Cursoarele de mărire ale Chromium (`zoom-in`, `zoom-out`) sunt bitmap-uri subțiri, deschise la culoare: pe un fundal alb
 * (o schemă, o imagine) cursorul dispărea. Aplicația are variante cu contur dublu (`--cursor-zoom-in` / `--cursor-zoom-out`
 * în index.css). Orice folosire a cursorului gol trebuie să treacă prin ele; `var(--cursor-zoom-in, zoom-in)` e forma corectă.
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
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('cursoare de mărire vizibile pe orice fundal', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');

  it('index.css definește ambele cursoare cu rezervă pe cel nativ', () => {
    expect(css).toMatch(/--cursor-zoom-in:\s*url\("data:image\/svg\+xml,[^"]+"\)\s*13 13,\s*zoom-in;/);
    expect(css).toMatch(/--cursor-zoom-out:\s*url\("data:image\/svg\+xml,[^"]+"\)\s*13 13,\s*zoom-out;/);
    expect(css).toMatch(/--cursor-grab:\s*url\("data:image\/svg\+xml,[^"]+"\)\s*16 16,\s*grab;/);
    expect(css).toMatch(/--cursor-grabbing:\s*url\("data:image\/svg\+xml,[^"]+"\)\s*16 16,\s*grabbing;/);
  });

  it('cursorul conține și halou alb, și trăsătură închisă (se vede pe alb și pe negru)', () => {
    const value = /--cursor-zoom-in:\s*url\("data:image\/svg\+xml,([^"]+)"\)/.exec(css)?.[1] ?? '';
    expect(value).toContain("stroke='white'");
    expect(value).toContain("stroke='%23111'");
  });

  it('nicio altă sursă nu mai cere `zoom-in`/`zoom-out`/`grab`/`grabbing` gol', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith('index.css')) {
        // În index.css doar definițiile variabilelor pot numi cursorul nativ (ca rezervă).
        const bare = css.split('\n').filter((line) => /cursor:\s*(zoom-(in|out)|grab(bing)?)\b/.test(line));
        if (bare.length) offenders.push(`${file}: ${bare.length} linii`);
        continue;
      }
      const text = readFileSync(file, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        const bareCursor = /cursor-(zoom-(in|out)|grab(bing)?)\b|cursor:\s*['"]?(zoom-(in|out)|grab(bing)?)\b/.test(line);
        if (bareCursor && !line.includes('--cursor-')) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
