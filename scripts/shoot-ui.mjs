// Capturi reale ale ecranelor StudyX (renderer-ul adevărat, în browser, profil de test semănat).
//
//   npm run ui:shoot
//   npm run ui:shoot -- --out=previews/capturi-noi --themes=light,dark --wide=1280x720,2560x1080
//
// Opțiuni: --out=<folder> (implicit previews/capturi-<data>)  --themes=light,dark  --wide=<lățimi extra pentru Panou>
//          --motion (animații normale; implicit mișcare redusă, ca imaginile să fie stabile)  --headed
// Nu atinge profilul real, nu pornește Electron; BASE=http://localhost:PORT folosește un server deja pornit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, browserPath, clearToasts, goTo, loadPlaywright, openSeededApp, parseArgs, startDevServer } from './lib/ui-harness.mjs';

const args = parseArgs();
const stamp = new Date().toISOString().slice(0, 10);
const OUT = String(args.out || join(ROOT, 'previews', `capturi-${stamp}`));
mkdirSync(OUT, { recursive: true });
const themes = String(args.themes || 'light,dark').split(',').filter((t) => t === 'light' || t === 'dark');
const wide = String(args.wide || '1280x720,2560x1080').split(',').map((s) => s.split('x').map(Number)).filter(([w, h]) => w && h);
const TAG = { light: 'luminos', dark: 'intunecat' };

const server = await startDevServer({ port: Number(args.port || 5241) });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: browserPath(), headless: !args.headed });
const log = [];
const errors = [];
try {
  for (const theme of themes) {
    const { context, page } = await openSeededApp(browser, server.url, { theme, reducedMotion: args.motion ? 'no-preference' : 'reduce' });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
    const tag = TAG[theme];
    const shot = async (name) => {
      await clearToasts(page);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(OUT, `${name}.png`) });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      const { width, height } = page.viewportSize();
      log.push(`${name}.png  ${width}x${height}${sw > width + 1 ? `  [scroll orizontal ${sw}px]` : ''}`);
      console.log('captură', name);
    };
    const step = async (name, fn) => { try { await fn(); } catch (e) { log.push(`EȘUAT ${name}: ${String(e.message).split('\n')[0]}`); } };
    const S = (n, name) => `${n}-${name}-${tag}-1920`;

    await step('panou', async () => { await goTo(page, '/'); await shot(S('01', 'panou')); });
    await step('grile', async () => { await goTo(page, '/quizzes'); await shot(S('02', 'grile-lista')); });
    await step('detaliu', async () => { await goTo(page, '/quiz/seed-cardio'); await shot(S('03', 'grile-detaliu')); });
    await step('sesiune', async () => {
      await goTo(page, '/play/seed-nefro');
      await shot(S('04', 'grile-sesiune'));
      for (let i = 0; i < 14; i += 1) {
        if (/#\/results\//.test(page.url())) break;
        const opt = page.getByRole('button', { name: /^A\s/ }).first();
        if (await opt.isVisible().catch(() => false)) await opt.click({ timeout: 3000 }).catch(() => {});
        await page.keyboard.press('1').catch(() => {});
        await page.waitForTimeout(250);
        const verify = page.getByRole('button', { name: /Verific|Confirm/i }).first();
        if (await verify.isEnabled().catch(() => false)) { await verify.click().catch(() => {}); await page.waitForTimeout(700); }
        if (i === 0) await shot(S('05', 'grile-sesiune-raspuns'));
        const fwd = page.locator('main button:visible').filter({ hasText: /Următoare|Continuă|Mai departe|Rezultat|Termin|Finaliz|Încheie/i }).last();
        if (await fwd.isVisible().catch(() => false)) await fwd.click().catch(() => {});
        else await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(600);
        const confirm = page.getByRole('dialog').getByRole('button', { name: /Termin|Finaliz|Încheie|Da\b/i }).first();
        if (await confirm.isVisible().catch(() => false)) { await confirm.click().catch(() => {}); await page.waitForTimeout(600); }
      }
      await page.waitForURL(/#\/results\//, { timeout: 5000 });
      await page.waitForTimeout(1500);
      await shot(S('06', 'grile-rezultate'));
    });
    await step('flashcarduri', async () => { await goTo(page, '/flashcards'); await shot(S('07', 'flashcarduri-hub')); });
    await step('flashcarduri sesiune', async () => {
      await goTo(page, '/flashcards/session/seed-deck-semne');
      await shot(S('08', 'flashcarduri-sesiune'));
      await page.mouse.click(1080, 560);
      await page.waitForTimeout(700);
      await shot(S('09', 'flashcarduri-sesiune-verso'));
    });
    await step('biblioteca', async () => { await goTo(page, '/vault'); await shot(S('10', 'biblioteca')); });
    await step('chat', async () => {
      await goTo(page, '/');
      await page.getByRole('button', { name: 'Deschide chatul AI' }).first().click();
      await page.waitForTimeout(1200);
      await shot(S('11', 'chat-ai'));
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Închide chatul AI' }).first().click({ timeout: 1500 }).catch(() => {});
    });
    await step('rezidentiat', async () => { await goTo(page, '/rezidentiat'); await shot(S('12', 'rezidentiat')); });
    await step('organizare', async () => { await goTo(page, '/rezidentiat/organizare'); await shot(S('13', 'rezidentiat-organizare')); });
    await step('statistici', async () => { await goTo(page, '/stats'); await shot(S('14', 'statistici')); });
    await step('erori', async () => { await goTo(page, '/erori'); await shot(S('15', 'caiet-erori')); });
    await step('recapitulare', async () => { await goTo(page, '/daily-review'); await shot(S('16', 'recapitulare-zilnica')); });
    await step('setari', async () => { await goTo(page, '/settings'); await shot(S('17', 'setari')); });
    for (const [w, h] of wide) {
      await step(`panou ${w}`, async () => { await page.setViewportSize({ width: w, height: h }); await goTo(page, '/'); await shot(`01-panou-${tag}-${w}`); });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.stop();
}
writeFileSync(join(OUT, '_log.txt'), [...log, '', 'Erori în consolă:', ...[...new Set(errors)]].join('\n'));
console.log(`\n${log.length} capturi în ${OUT}; erori în consolă: ${new Set(errors).size}`);
