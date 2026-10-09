import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dur, ease, spring, staggerStep, staggerMax, resolve as resolveMotion } from '../theme/motion';

const SRC = resolve(__dirname, '..');
const css = readFileSync(join(SRC, 'index.css'), 'utf8').replace(/\r\n/g, '\n');

function cssToken(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  expect(m, `${name} lipsește din index.css`).not.toBeNull();
  return m![1].trim();
}

describe('tokeni de mișcare: CSS și motion.ts au aceleași valori', () => {
  it.each(Object.entries(dur))('durata %s', (key, seconds) => {
    expect(parseFloat(cssToken(`--dur-${key}`))).toBeCloseTo(seconds, 5);
  });

  it.each(Object.entries(ease))('curba %s', (key, bezier) => {
    const nums = cssToken(`--ease-${key}`).match(/cubic-bezier\(([^)]+)\)/)![1].split(',').map(Number);
    expect(nums).toEqual(bezier);
  });

  it('resorturile din spec', () => {
    expect(spring.nav).toMatchObject({ stiffness: 420, damping: 34 });
    expect(spring.panel).toMatchObject({ stiffness: 300, damping: 30 });
    expect(spring.tap).toMatchObject({ stiffness: 460, damping: 26, mass: 0.7 });
    expect(staggerStep).toBe(0.04);
    expect(staggerMax).toBe(8);
  });

  it('.fx-rise folosește pasul de 40ms cu plafon 8', () => {
    expect(css).toContain('animation-delay: calc(min(var(--i, 0), 8) * 40ms)');
  });

  it('resolve(true) întoarce tranziții instantanee, fără resorturi', () => {
    const calm = resolveMotion(true);
    expect(calm.modal).toEqual({ duration: dur.instant });
    expect(calm.toast).toEqual({ duration: dur.instant });
    expect(calm.stagger).toBe(0);
    expect(resolveMotion(false).stagger).toBe(staggerStep);
  });
});

describe('mișcare redusă (lite / economisire / reduced-motion)', () => {
  const liteSection = css.slice(css.indexOf('Mișcare redusă: lite'));

  it('fiecare @keyframes folosit într-o animație infinită se oprește în blocul lite', () => {
    const infinite: { keyframes: string; selector: string }[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decl = m[2].match(/animation:\s*([\w-]+)[^;]*\binfinite\b/);
      if (decl) infinite.push({ keyframes: decl[1], selector: m[1].trim() });
    }
    expect(infinite.length).toBeGreaterThanOrEqual(6);
    for (const { keyframes, selector } of infinite) {
      expect(css, `@keyframes ${keyframes}`).toContain(`@keyframes ${keyframes}`);
      // Selectorul (ultimul în listă, fără pseudo-clase) trebuie să apară în secțiunea de oprire.
      const target = selector.split(',').pop()!.trim().split('\n').pop()!.trim();
      expect(liteSection, `${target} (${keyframes}) nu e oprit în blocul lite`).toContain(target);
    }
    expect(liteSection).toMatch(/animation:\s*none/);
  });

  it('lite și reduced-motion scurtează duratele', () => {
    expect(liteSection).toMatch(/--dur-fast:\s*0\.12s/);
    expect(liteSection).toMatch(/--dur-base:\s*0\.16s/);
    expect(liteSection).toMatch(/--dur-slow:\s*0\.2s/);
    expect(liteSection).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

/* ── Ratchet: nu are voie să crească; scade pe măsură ce paginile migrează la motion.ts / tokeni CSS. ── */
const CEILING = {
  cubicBezierInTsx: 2,
  stiffnessInTsx: 4,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe('ratchet de mișcare (src/**/*.tsx)', () => {
  const files = walk(SRC);
  const count = (re: RegExp) =>
    files.reduce((sum, f) => sum + readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => re.test(l)).length, 0);

  it('cubic-bezier( în .tsx nu crește', () => {
    expect(count(/cubic-bezier\(/)).toBeLessThanOrEqual(CEILING.cubicBezierInTsx);
  });
  it('stiffness: în .tsx nu crește (folosește spring.* din motion.ts)', () => {
    expect(count(/stiffness:/)).toBeLessThanOrEqual(CEILING.stiffnessInTsx);
  });
});
