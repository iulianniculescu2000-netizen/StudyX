import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gărzi de performanță: prind regresii care costă randare fără să schimbe aspectul. Nu judecă estetica;
 * cazurile existente sunt trecute explicit pe liste („bugete”), ca testul să treacă azi și să cadă doar la
 * ceva NOU. Când reduci un caz, coboară și bugetul; când adaugi unul cu motiv, urcă-l conștient, în același commit.
 */
const SRC = resolve(__dirname, '..');
const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.includes(`${join('src', 'test')}`)) out.push(full);
  }
  return out;
}
const files = walk(SRC);
const rel = (file: string) => relative(SRC, file).replace(/\\/g, '/');
const tsx = files.filter((f) => /\.tsx?$/.test(f));
const css = files.filter((f) => f.endsWith('.css'));
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

describe('gărzi de performanță', () => {
  it('backdrop-filter: buget pentru reguli CSS și stiluri inline (fiecare costă GPU când se mișcă ce e în spate)', () => {
    const cssRules = css.reduce((n, f) => n + count(read(f), /(^|[^-])backdrop-filter\s*:/gm), 0);
    const inline = tsx.reduce((n, f) => n + count(read(f), /backdropFilter|backdrop-blur/g), 0);
    expect(cssRules, 'reguli backdrop-filter în CSS').toBeLessThanOrEqual(21);
    expect(inline, 'backdropFilter / backdrop-blur în componente').toBeLessThanOrEqual(49);
  });

  it('fără `transition: all` în CSS și fără clase noi `transition-all` (animă și proprietăți scumpe, ca layout-ul)', () => {
    for (const f of css) expect(read(f), rel(f)).not.toMatch(/transition\s*:\s*all\b/);
    const withAll = tsx.filter((f) => /\btransition-all\b/.test(read(f))).map(rel).sort();
    // Cazuri existente; fiecare poate fi îngustat la proprietățile animate efectiv.
    const GRANDFATHERED = ['components/BookTableOfContents.tsx', 'components/KeyboardShortcuts.tsx', 'components/PremiumSelect.tsx'];
    for (const f of withAll) expect(GRANDFATHERED, `transition-all nou în ${f}`).toContain(f);
  });

  it('will-change permanent în CSS: buget (fiecare ține un strat în memoria GPU tot timpul)', () => {
    const total = css.reduce((n, f) => n + count(read(f), /will-change\s*:\s*(?!auto)/g), 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  it('animațiile framer infinite (repeat: Infinity) apar doar în fișierele cunoscute, care le opresc fără mișcare', () => {
    const withInfinite = tsx.filter((f) => /repeat:\s*Infinity/.test(read(f))).map(rel).sort();
    const KNOWN = [
      'components/BookTableOfContents.tsx', 'components/DropzoneOverlay.tsx', 'components/MagicImportCard.tsx',
      'components/QuizImage.tsx', 'components/UpdateModal.tsx', 'components/WhatsNewTour.tsx', 'components/ai-chat/AIOrb.tsx',
      'components/dashboard/DashboardHeroCard.tsx', 'components/organizare/Overview.tsx', 'components/sidebar/UpdateButton.tsx',
      'components/ui/ProcessLoader.tsx', 'pages/ProfileSelect.tsx', 'pages/Welcome.tsx', 'pages/quiz-play/ai-panels.tsx',
    ];
    for (const f of withInfinite) {
      expect(KNOWN, `buclă framer nouă în ${f}: preferă CSS pe transform/opacitate (rulează pe compozitor) și oprește-o sub calmMotion`).toContain(f);
    }
  });

  it('setInterval sub o secundă are mereu clearInterval în același fișier', () => {
    for (const f of tsx) {
      const text = read(f);
      const fast = [...text.matchAll(/setInterval\([^;]*?,\s*(\d+)\s*\)/g)].filter((m) => Number(m[1]) < 1000);
      if (fast.length) expect(text, `${rel(f)}: setInterval de ${fast[0][1]} ms fără clearInterval`).toMatch(/clearInterval\(/);
    }
  });

  it('buclele CSS infinite din Mascot.css și index.css nu animă `filter` nou (nu poate rula pe compozitor)', () => {
    // streak-fire animă deja filter (drop-shadow); e singurul caz permis până decide proprietarul (vezi previews/performanta/RAPORT.md).
    const allowed = new Set(['streak-fire']);
    for (const f of css) {
      const text = read(f);
      for (const m of text.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
        const [, name, body] = m;
        const infinite = new RegExp(`animation:\\s*${name}\\b[^;]*\\binfinite\\b`).test(text);
        if (infinite && /\bfilter\s*:/.test(body)) expect(allowed, `${rel(f)}: @keyframes ${name} animă filter într-o buclă`).toContain(name);
      }
    }
  });
});
