// Măsoară costul de randare al ecranelor StudyX în browser (nu în Electron, nu pe profilul real).
//
//   npm run perf:measure
//   npm run perf:measure -- --screens=panou,grile --theme=dark --throttle=1,4 --seconds=5 --label=dupa
//
// Opțiuni: --root=<alt checkout, ex. un git worktree pentru „înainte”>  --port=5240
//          --screens (panou, grile, sesiune, flashcarduri, chat, statistici, erori, organizare, setari)
//          --theme=light|dark  --throttle=1,4  --width=1920 --height=1080  --seconds=5  --headed
//          --label=<nume>  --out=<folder> (implicit previews/performanta/rezultate)
// Pentru fiecare ecran: N secunde în repaus și N secunde cu derulare + mișcarea mouse-ului.
// Rezultat: <label>.json și <label>.md (tabel). BASE=http://localhost:PORT folosește un server deja pornit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, browserPath, goTo, loadPlaywright, openSeededApp, parseArgs, startDevServer, clearToasts } from './lib/ui-harness.mjs';

const args = parseArgs();
const SCREENS = {
  panou: '/', grile: '/quizzes', sesiune: '/play/seed-cardio', flashcarduri: '/flashcards', chat: 'chat',
  statistici: '/stats', erori: '/erori', organizare: '/rezidentiat/organizare', setari: '/settings',
};
const screens = String(args.screens || 'panou,grile,sesiune,flashcarduri,chat,statistici').split(',').map((s) => s.trim()).filter((s) => SCREENS[s]);
const throttles = String(args.throttle || '1,4').split(',').map(Number).filter((n) => n >= 1);
const theme = args.theme === 'dark' ? 'dark' : 'light';
const width = Number(args.width || 1920);
const height = Number(args.height || 1080);
const windowMs = Number(args.seconds || 5) * 1000;
const label = String(args.label || `masurare-${theme}`);
const outDir = String(args.out || join(ROOT, 'previews', 'performanta', 'rezultate'));
mkdirSync(outDir, { recursive: true });

const server = await startDevServer({ port: Number(args.port || 5240), ...(args.root ? { root: String(args.root) } : {}) });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: browserPath(), headless: !args.headed });
try {
  const { context, page } = await openSeededApp(browser, server.url, { width, height, theme });
  const cdp = await context.newCDPSession(page);
  const bcdp = await browser.newBrowserCDPSession();
  await cdp.send('Performance.enable');
  // La pornire aplicația preîncarcă paginile în pauze: nu măsurăm încălzirea.
  await page.waitForTimeout(10_000);

  const procTimes = async () => {
    const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
    const out = { renderer: 0, gpu: 0, browser: 0 };
    for (const p of processInfo) { const t = p.type.toLowerCase(); if (t in out) out[t] += p.cpuTime; }
    return out;
  };
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

  async function measure(interact) {
    await page.evaluate(() => {
      const w = window; w.__frames = []; w.__run = true;
      let last = performance.now();
      const loop = (t) => { w.__frames.push(t - last); last = t; if (w.__run) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const m0 = await metrics(); const p0 = await procTimes(); const t0 = Date.now();
    if (interact) {
      let dir = 1; let i = 0;
      while (Date.now() - t0 < windowMs) {
        await page.mouse.move(width * 0.55 + Math.sin(i / 3) * 300, height / 2 + Math.cos(i / 4) * 200, { steps: 2 });
        await page.mouse.wheel(0, 120 * dir);
        i += 1; if (i % 12 === 0) dir = -dir;
        await page.waitForTimeout(40);
      }
    } else {
      await page.waitForTimeout(windowMs);
    }
    const seconds = (Date.now() - t0) / 1000;
    const p1 = await procTimes(); const m1 = await metrics();
    const frames = await page.evaluate(() => { window.__run = false; return window.__frames.slice(1); });
    const per = (a, b) => +(((b - a) / seconds) * 1000).toFixed(1);
    return {
      seconds: +seconds.toFixed(1),
      mainThreadMsPerS: per(m0.TaskDuration, m1.TaskDuration),
      scriptMsPerS: per(m0.ScriptDuration, m1.ScriptDuration),
      styleMsPerS: per(m0.RecalcStyleDuration, m1.RecalcStyleDuration),
      layoutMsPerS: per(m0.LayoutDuration, m1.LayoutDuration),
      rendererCpuMsPerS: per(p0.renderer, p1.renderer),
      gpuCpuMsPerS: per(p0.gpu, p1.gpu),
      fps: +(frames.length / seconds).toFixed(1),
      longFrames: frames.filter((d) => d > 34).length,
      p95FrameMs: +([...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)] ?? 0).toFixed(1),
    };
  }

  const results = [];
  for (const throttle of throttles) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    for (const name of screens) {
      const route = SCREENS[name];
      if (route === 'chat') {
        await goTo(page, '/');
        await page.getByRole('button', { name: 'Deschide chatul AI' }).first().click().catch(() => {});
        await page.waitForTimeout(2500);
      } else {
        await goTo(page, route);
      }
      await clearToasts(page);
      const idle = await measure(false);
      const active = await measure(true);
      results.push({ screen: name, throttle, idle, active });
      console.log(`${name.padEnd(13)} CPU ${throttle}×  repaus: fir principal ${idle.mainThreadMsPerS} ms/s, GPU ${idle.gpuCpuMsPerS} ms/s | derulare: fir ${active.mainThreadMsPerS} ms/s, GPU ${active.gpuCpuMsPerS} ms/s, ${active.fps} cadre/s, ${active.longFrames} cadre lungi`);
      if (route === 'chat') {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Închide chatul AI' }).first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const out = { label, date: new Date().toISOString(), theme, width, height, windowMs, throttles, results };
  writeFileSync(join(outDir, `${label}.json`), JSON.stringify(out, null, 2));
  const md = [
    `# Măsurare randare: ${label}`, '',
    `${out.date} · tema ${theme} · ${width}×${height} · ${windowMs / 1000} s pe fază · ms de CPU pe secundă (mai mic = mai ușor)`, '',
    '| Ecran | CPU | Repaus: fir principal | Repaus: GPU | Derulare: fir principal | Derulare: GPU | Cadre/s | Cadre > 34 ms |',
    '|---|---|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.screen} | ${r.throttle}× | ${r.idle.mainThreadMsPerS} | ${r.idle.gpuCpuMsPerS} | ${r.active.mainThreadMsPerS} | ${r.active.gpuCpuMsPerS} | ${r.active.fps} | ${r.active.longFrames} |`),
    '',
  ].join('\n');
  writeFileSync(join(outDir, `${label}.md`), md);
  console.log(`\nRezultate: ${join(outDir, `${label}.json`)} și .md`);
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}
