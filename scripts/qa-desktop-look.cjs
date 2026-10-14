// Cum arată aplicația în Electron față de browser: profilul de performanță ales, semnalele de dispozitiv și o captură.
// Rulează pe date izolate (STUDYX_USER_DATA), niciodată pe datele instalate. Construiește întâi: `npm run build`.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'studyx-look-'));
  const out = path.join(root, '.qa-results');
  await fs.mkdir(out, { recursive: true });
  const env = { ...process.env, STUDYX_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  // STUDYX_QA_EXECUTABLE: aplicația împachetată (win-unpackedStudyX.exe); altfel codul din repo, cu serverul de pe STUDYX_DEV_URL.
  const executable = process.env.STUDYX_QA_EXECUTABLE;
  if (!executable) env.STUDYX_DEV_URL = process.env.STUDYX_DEV_URL || 'http://localhost:5199';
  const app = await electron.launch({ ...(executable ? { executablePath: executable } : { args: [root] }), cwd: root, env, timeout: 60000 });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize?.({ width: 1280, height: 760 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(6000);
    console.log('url', page.url(), JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 200)));
    const name = page.locator('input[type="text"]').first();
    if (await name.count()) {
      await name.fill('Test');
      await page.getByRole('button', { name: /Intră în aplicație/ }).click();
      await page.waitForTimeout(3500);
    }
    for (let i = 0; i < 3; i += 1) {
      const skip = page.getByRole('button', { name: /^Sari peste/ }).first();
      if (await skip.count()) { await skip.click().catch(() => {}); await page.waitForTimeout(1200); }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }
    const info = await page.evaluate(() => ({
      performance: document.documentElement.getAttribute('data-performance'),
      powerSave: document.documentElement.getAttribute('data-power-save'),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      reducedData: matchMedia('(prefers-reduced-data: reduce)').matches,
      cores: navigator.hardwareConcurrency,
      memory: navigator.deviceMemory,
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      backdrop: CSS.supports('backdrop-filter', 'blur(10px)'),
    }));
    console.log(JSON.stringify(info));
    await page.screenshot({ path: path.join(out, 'desktop-look.png') });
  } finally {
    await app.close();
    await fs.rm(data, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
