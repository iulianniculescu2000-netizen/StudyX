import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..');
const css = readFileSync(join(SRC, 'index.css'), 'utf8').replace(/\r\n/g, '\n');

/** Corpul unui bloc CSS care începe cu `selector {` (primul găsit, până la `}` care îl închide). */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `blocul ${selector} lipsește din index.css`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const end = css.indexOf('\n}', open);
  return css.slice(open + 1, end);
}

describe('tokeni de elevație (index.css)', () => {
  const light = block(':root,\n:root[data-theme="light"]');
  const dark = block(':root[data-theme="dark"]');

  it.each([1, 2, 3, 4])('--elev-%i e definit pentru ambele teme', (n) => {
    expect(light).toMatch(new RegExp(`--elev-${n}:\\s*[^;]+;`));
    expect(dark).toMatch(new RegExp(`--elev-${n}:\\s*[^;]+;`));
  });

  it('--shadow-rgb există în ambele teme, iar --elev-0 e none', () => {
    expect(light).toMatch(/--shadow-rgb:\s*26 33 56;/);
    expect(dark).toMatch(/--shadow-rgb:\s*0 0 0;/);
    expect(light).toMatch(/--elev-0:\s*none;/);
  });

  it('în tema luminoasă nicio umbră din --elev-* nu depășește .16 opacitate', () => {
    const opacities = [...light.matchAll(/--elev-\d:[^;]*;/g)]
      .flatMap((m) => [...m[0].matchAll(/\/\s*\.?(\d*\.?\d+)\)/g)].map((o) => Number(o[1].startsWith('.') ? o[1] : `0.${o[1].replace(/^0?\./, '')}`)));
    expect(opacities.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...opacities)).toBeLessThanOrEqual(0.16);
  });

  it('tokenii de inel, strălucire, raze și blur există', () => {
    for (const name of ['--hairline-ring', '--ring-focus', '--ring-inset', '--glow-1', '--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-full', '--blur-1', '--blur-2', '--blur-3']) {
      expect(css, name).toContain(`${name}:`);
    }
  });

  it('Tailwind: --shadow-sm…2xl trimit către scara de elevație', () => {
    expect(css).toMatch(/--shadow-lg:\s*var\(--elev-2\)/);
    expect(css).toMatch(/--shadow-2xl:\s*var\(--elev-4\)/);
  });
});

/* ── Ratchet: scade pe măsură ce paginile migrează la tokeni; nu are voie să crească. ───────────────
   Ținte finale: boxShadow inline ≤ 15, rgba în umbre ≤ 5, umbre arbitrare (`shadow-[`/`shadow-2xl` fără var) = 0,
   rounded în afara {10,14,20,28} ≤ 20. Când cobori numărul real, coboară și plafonul de mai jos. */
const CEILING = {
  inlineBoxShadow: 26,
  rgbaInShadows: 1,
  arbitraryShadow: 0,
  roundedOutsideSet: 6,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function measure() {
  let inlineBoxShadow = 0;
  let rgbaInShadows = 0;
  let arbitraryShadow = 0;
  let roundedOutsideSet = 0;
  const allowedRadius = new Set([10, 14, 20, 28]);
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const hasTokenShadow = /var\(--(elev|ring|glow)/.test(line);
      if (/boxShadow:/.test(line)) {
        if (!hasTokenShadow) inlineBoxShadow++;
        if (/rgba?\(/.test(line)) rgbaInShadows++;
      }
      if (/shadow-2xl|shadow-\[/.test(line) && !line.includes('var(--')) {
        arbitraryShadow++;
        if (/rgba?\(/.test(line)) rgbaInShadows++;
      }
      for (const m of line.matchAll(/rounded(?:-[a-z]{1,2})?-\[(\d+)px\]/g)) {
        if (!allowedRadius.has(Number(m[1]))) roundedOutsideSet++;
      }
    }
  }
  return { inlineBoxShadow, rgbaInShadows, arbitraryShadow, roundedOutsideSet };
}

describe('ratchet de design (src/**/*.{ts,tsx})', () => {
  const now = measure();

  it('boxShadow inline fără var(--elev|--ring|--glow) nu crește', () => {
    expect(now.inlineBoxShadow).toBeLessThanOrEqual(CEILING.inlineBoxShadow);
  });
  it('rgba în umbre nu crește', () => {
    expect(now.rgbaInShadows).toBeLessThanOrEqual(CEILING.rgbaInShadows);
  });
  it('umbre arbitrare (shadow-[ / shadow-2xl fără var) nu cresc', () => {
    expect(now.arbitraryShadow).toBeLessThanOrEqual(CEILING.arbitraryShadow);
  });
  it('rounded-[Npx] în afara {10,14,20,28} nu crește', () => {
    expect(now.roundedOutsideSet).toBeLessThanOrEqual(CEILING.roundedOutsideSet);
  });
});
