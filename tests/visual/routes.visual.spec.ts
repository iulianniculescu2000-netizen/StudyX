import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Verificare vizuală a rutelor principale: ambele teme × trei dimensiuni de fereastră.
// 1536×816 = fereastra maximizată pe laptopul cu ecran 1920×1080 la 125%.
// Capturile se salvează în .qa-results-visual/ pentru inspecție; verificările automate sunt cele care pică testul.

const SIZES = [
  { w: 1536, h: 816 },
  { w: 1280, h: 720 },
  { w: 1024, h: 700 },
] as const;
const THEMES = [['Luminos', 'light'], ['Întunecat', 'dark']] as const;
const ROUTES = [
  ['panou', '/'],
  ['grile', '/quizzes'],
  ['sesiune', '/play/vis-quiz'],
  ['flashcarduri', '/flashcards'],
  ['rezidentiat', '/rezidentiat'],
  ['biblioteca', '/vault'],
  ['statistici', '/stats'],
  ['erori', '/erori'],
  ['setari', '/settings'],
] as const;

async function dismissOverlays(page: Page) {
  const close = page.getByRole('button', { name: /Închide turul|Închide prezentarea|Sari peste/ });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!(await close.first().waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false))) return;
    await close.first().click();
    await page.waitForTimeout(150);
  }
}

async function onboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden({ timeout: 20000 });
  const name = page.getByRole('textbox', { name: 'Cum te cheamă?' });
  await expect(name.or(page.locator('main'))).toBeVisible({ timeout: 20000 });
  if (await name.isVisible().catch(() => false)) {
    await name.pressSequentially('QA Vizual');
    await page.getByRole('button', { name: /Intr/i }).click();
  }
  await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  await dismissOverlays(page);
  await page.evaluate(async () => {
    const m = await import('/src/store/quizStore.ts');
    const questions = [1, 2, 3].map((i) => ({
      id: `q${i}`,
      text: `Care este valoarea normală a tensiunii arteriale la adult, numărul ${i}?`,
      options: ['A', 'B', 'C', 'D', 'E'].map((l, k) => ({ id: `o${i}${l}`, text: `Varianta ${l} cu un text mai lung pentru test`, isCorrect: k === 0 })),
    }));
    m.useQuizStore.getState().addQuiz({
      id: 'vis-quiz', title: 'Grilă test cardiologie', description: 'test', emoji: '❤️', color: 'blue',
      category: 'Cardiologie', questions, createdAt: Date.now(),
    });
  });
}

async function go(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  await dismissOverlays(page);
  await page.goto(`/#${route}`);
  await page.waitForTimeout(500);
}

for (const [themeLabel, theme] of THEMES) {
  for (const { w, h } of SIZES) {
    test(`rute ${theme} ${w}x${h}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: w, height: h });
      await onboard(page);
      await go(page, '/settings?s=aspect');
      await page.getByRole('radio', { name: themeLabel, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      for (const [name, route] of ROUTES) {
        await go(page, route);
        const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
        expect.soft(scrollW, `${name}: scroll orizontal`).toBeLessThanOrEqual(w + 1);
        await page.screenshot({ path: `.qa-results-visual/${theme}-${w}x${h}-${name}.png` });
        // Axe doar la dimensiunea laptopului, ca să rămână rapid.
        if (w === 1536) {
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
          expect.soft(
            results.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length, first: nodes[0]?.target.join(' ') })),
            `${name}: accesibilitate`,
          ).toEqual([]);
        }
      }
      expect.soft(errors.filter((e) => !/Failed to load resource|favicon/.test(e)), 'erori în consolă').toEqual([]);
    });
  }
}
