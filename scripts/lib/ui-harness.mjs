// Piese comune pentru scripts/perf-measure.mjs și scripts/shoot-ui.mjs:
// un Vite de dezvoltare propriu (fără HMR, port separat, cache Vite separat în %TEMP%), un browser fără profil
// și un profil de test semănat prin store-urile aplicației. Nu atinge profilul real (%APPDATA%\StudyX),
// nu pornește Electron și nu folosește portul 5173 sau cache-ul node_modules/.vite al lui electron:dev.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMP = join(tmpdir(), 'studyx-ui-harness');

// Siguranță în plus: orice proces Electron pornit din aceste scripturi ar folosi un profil temporar.
process.env.STUDYX_USER_DATA ??= join(TEMP, 'user-data');

/** Argumente `--cheie=valoare` (și `--steag`). */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}

export async function loadPlaywright() {
  const entry = join(ROOT, 'node_modules', 'playwright-core', 'index.mjs');
  if (!existsSync(entry)) throw new Error('Lipsește playwright-core din node_modules (rulează npm install).');
  return import(pathToFileURL(entry).href);
}

/** Browserul: STUDYX_TEST_BROWSER, apoi Brave, Chrome sau Edge instalate. */
export function browserPath() {
  const candidates = [
    process.env.STUDYX_TEST_BROWSER,
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Nu găsesc un browser Chromium. Setează STUDYX_TEST_BROWSER=<cale către .exe>.');
  return found;
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* încă pornește */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Serverul nu a răspuns la ${url} în ${timeoutMs / 1000} s.`);
}

/**
 * Pornește Vite pentru `root` (implicit acest repo) pe `port`, fără HMR și cu cache propriu.
 * Dacă e setat BASE (ex. http://localhost:5231), folosește serverul existent și nu pornește nimic.
 */
export async function startDevServer({ root = ROOT, port = 5240 } = {}) {
  if (process.env.BASE) return { url: process.env.BASE.replace(/\/$/, ''), stop: async () => {} };
  mkdirSync(TEMP, { recursive: true });
  const config = join(TEMP, `vite.${port}.config.mts`);
  const posix = (p) => p.replace(/\\/g, '/');
  writeFileSync(config, [
    `import base from '${posix(join(root, 'vite.config.ts'))}'`,
    'export default {',
    '  ...base,',
    `  root: '${posix(root)}',`,
    `  cacheDir: '${posix(join(TEMP, `vite-cache-${port}`))}',`,
    "  optimizeDeps: { ...(base as { optimizeDeps?: object }).optimizeDeps, entries: ['index.html'] },",
    `  server: { ...(base as { server?: object }).server, hmr: false, port: ${port}, strictPort: true },`,
    '}',
    '',
  ].join('\n'));
  const child = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', config], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const url = `http://localhost:${port}`;
  try {
    await waitForHttp(url, 60_000);
  } catch (error) {
    child.kill();
    throw new Error(`${error.message}\n${log.slice(-2000)}`);
  }
  return {
    url,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise((r) => child.once('exit', r));
    },
  };
}

async function closeTours(page) {
  await page.evaluate(async () => {
    const { useTutorialStore } = await import('/src/store/tutorialStore.ts');
    const { useUserStore } = await import('/src/store/userStore.ts');
    const id = useUserStore.getState().activeProfileId;
    if (!id) return;
    useTutorialStore.getState().markAllSeen(id);
    useTutorialStore.getState().finishTour(id);
  });
}

export async function clearToasts(page) {
  await page.evaluate(async () => {
    const { useToastStore } = await import('/src/store/toastStore.ts');
    const s = useToastStore.getState();
    (s.toasts || []).forEach((t) => s.removeToast(t.id));
  }).catch(() => {});
}

/**
 * Context nou de browser (profil gol), profil „Andreea” creat prin ecranul de bun venit, date de test semănate,
 * filmul și tururile marcate ca văzute. Întoarce { context, page }.
 */
export async function openSeededApp(browser, url, { width = 1920, height = 1080, theme = 'light', reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ro-RO', reducedMotion, colorScheme: theme });
  const page = await context.newPage();
  // Vite poate reîncărca pagina o dată la prima optimizare a dependențelor: așteptăm generos.
  await page.goto(`${url}/`);
  await page.waitForFunction(() => document.querySelector('#welcome-name') || document.querySelector('main'), null, { timeout: 90_000 });
  await page.waitForTimeout(500);
  const nameBox = page.locator('#welcome-name');
  if (await nameBox.isVisible().catch(() => false)) {
    await nameBox.pressSequentially('Andreea');
    await page.getByRole('button', { name: /Intr/i }).click();
  }
  await page.locator('main').first().waitFor({ state: 'attached', timeout: 30_000 });
  await closeTours(page);
  const seed = readFileSync(join(ROOT, 'scripts', 'lib', 'ui-seed.js'), 'utf8');
  await page.evaluate(`(${seed})()`);
  await page.evaluate((t) => {
    localStorage.setItem('studyx-theme-mode', t);
    sessionStorage.setItem('studyx-mascot-greeted', '1');
  }, theme);
  await page.reload();
  await page.locator('main').first().waitFor({ state: 'attached', timeout: 30_000 });
  await closeTours(page);
  await clearToasts(page);
  return { context, page };
}

/** Navighează în aplicație (HashRouter) și așteaptă să se liniștească intrările animate. */
export async function goTo(page, route, settleMs = 2500) {
  await page.evaluate((r) => { window.location.hash = r; }, route);
  await page.waitForTimeout(400);
  await clearToasts(page);
  await page.mouse.move(5, page.viewportSize().height - 5);
  await page.waitForTimeout(settleMs);
}
