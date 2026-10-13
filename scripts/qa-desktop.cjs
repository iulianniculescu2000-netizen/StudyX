// Run against an isolated profile, never the user's installed StudyX data.
const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'studyx-desktop-qa-'));
  await fs.mkdir(path.join(root, '.qa-results'), { recursive: true });
  const env = { ...process.env, STUDYX_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.STUDYX_QA_EXECUTABLE;
  const app = await electron.launch({ args: executable ? [] : [root], ...(executable ? { executablePath: executable } : {}), cwd: root, env, timeout: 60000 });
  console.log('Desktop process launched');
  const issues = [];
  try {
    const first = await app.firstWindow();
    const page = app.windows().find((window) => !window.url().startsWith('devtools:')) ?? first;
    page.setDefaultTimeout(30000);
    console.log(`Desktop window: ${page.url()}`);
    await page.waitForLoadState('domcontentloaded');
    page.on('pageerror', (error) => issues.push(error.message));
    await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden({ timeout: 30000 });
    await page.getByRole('textbox', { name: 'Cum te cheamă?' }).fill('QA Desktop');
    await page.getByRole('button', { name: /Intr/i }).click();
    await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
    const closeTours = async () => {
      for (let i = 0; i < 4; i++) {
        const close = page.getByRole('button', { name: /Închide turul|Închide prezentarea|Sari peste/ }).first();
        if (!await close.isVisible()) break;
        await close.click();
        await page.waitForTimeout(200);
      }
    };
    await closeTours();
    await page.screenshot({ path: path.join(root, '.qa-results', 'desktop-dashboard.png') });
    await page.evaluate(() => window.dispatchEvent(new Event('studyx:welcome-film:open')));
    const film = page.locator('[role="dialog"][data-film-scene]');
    await expect(film).toHaveAttribute('data-film-playing', 'true');
    await film.getByRole('button', { name: 'Pornește narațiunea' }).click();
    await expect(film.locator('audio')).toHaveJSProperty('paused', false);
    await film.getByRole('button', { name: 'Pauză film' }).click();
    const paused = await film.getAttribute('data-film-elapsed-ms');
    await page.waitForTimeout(500);
    await expect(film).toHaveAttribute('data-film-elapsed-ms', paused);
    await expect(film.locator('audio')).toHaveJSProperty('paused', true);
    await page.screenshot({ path: path.join(root, '.qa-results', 'desktop-intro.png') });
    await page.keyboard.press('Escape');
    console.log('PASS desktop local narration and film pause');
    for (const route of ['/quizzes', '/flashcards', '/vault', '/rezidentiat', '/rezidentiat/organizare', '/erori', '/simulare', '/stats', '/settings?s=ajutor']) {
      await page.evaluate((route) => { window.location.hash = route; }, route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
      await closeTours();
      await expect(page.locator('main')).not.toBeEmpty();
      console.log(`PASS desktop route ${route}`);
    }
    const ipc = await page.evaluate(async () => {
      const api = window.electronAPI;
      const serialized = JSON.stringify({ notes: { qa: 'Persistență verificată' } });
      await api.storageSave('qa-desktop', 'notes', serialized);
      return { version: await api.updaterGetVersion(), loaded: await api.storageLoad('qa-desktop', 'notes'), backup: await api.autoBackup(JSON.stringify({ qa: true })) };
    });
    expect(JSON.stringify(ipc.loaded)).toContain('Persistență verificată');
    expect(ipc.version).toBe('1.0.0');
    expect(ipc.backup.success).toBe(true);
    expect(path.resolve(ipc.backup.path).startsWith(data + path.sep)).toBe(true);
    console.log('PASS desktop persistence, backup isolation and updater version');
    await page.reload();
    await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden();
    expect(await page.getByRole('textbox', { name: 'Cum te cheamă?' }).count()).toBe(0);
    await page.screenshot({ path: path.join(root, '.qa-results', 'desktop.png') });
    expect(issues).toEqual([]);
    console.log(`PASS desktop restart; isolated data: ${data}`);
  } finally {
    await app.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
