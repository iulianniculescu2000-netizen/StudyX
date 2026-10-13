// Funcțiile pe care le-a adus lucrul de după 1.0: cardul „Pentru tine”, exersarea pe subiect, micro-demo-urile din ghiduri,
// cererea de grile din chat și accesibilitatea (axe) în ambele teme. Rulează în Electron, pe date izolate (STUDYX_USER_DATA),
// niciodată pe datele instalate. Construiește întâi aplicația: `npm run build`.
const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DAY = 86_400_000;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
/** Erori așteptate: nu există cheie AI în profilul izolat. */
const EXPECTED_ERRORS = [/Cheia API .* nu este configurată/i, /Failed to load resource/i];

function seedData(now) {
  const question = (quizId, index, text) => ({
    id: `${quizId}${index}`, text,
    options: [{ id: `${quizId}${index}a`, text: 'Răspuns corect', isCorrect: true }, { id: `${quizId}${index}b`, text: 'Alt răspuns', isCorrect: false }],
  });
  const quiz = (id, title, count) => ({
    id, title, category: title, kind: 'quiz', emoji: '📘', color: 'blue', folderId: null, shuffleQuestions: false, shuffleAnswers: false,
    createdAt: now - 30 * DAY, questions: Array.from({ length: count }, (_, i) => question(id, i, `${title} întrebarea ${i + 1}`)),
  });
  const stat = (quizId, index, correct, wrong, days) => ({
    questionId: `${quizId}${index}`, quizId, timesCorrect: correct, timesWrong: wrong, lastSeen: now - days * DAY, nextReview: now - DAY, interval: 1,
  });
  const questionStats = {};
  for (let i = 0; i < 6; i++) questionStats[`arit:arit${i}`] = stat('arit', i, i < 2 ? 1 : 0, i < 4 ? 2 : 1, 1);
  for (let i = 0; i < 5; i++) questionStats[`ic:ic${i}`] = stat('ic', i, 3, 0, 10);
  for (let i = 0; i < 4; i++) questionStats[`nef:nef${i}`] = stat('nef', i, 3, 0, 1);
  return {
    quizzes: { quizzes: [quiz('arit', 'Aritmii', 8), quiz('ic', 'Insuficiență cardiacă', 6), quiz('nef', 'Nefrologie', 5)], sessions: [] },
    stats: { questionStats, streak: { currentStreak: 0, longestStreak: 0, lastStudyDate: '', studyDates: [] }, totalStudyTime: 0 },
  };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'studyx-features-qa-'));
  await fs.mkdir(path.join(root, '.qa-results'), { recursive: true });
  const env = { ...process.env, STUDYX_USER_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.STUDYX_QA_EXECUTABLE;
  const app = await electron.launch({ args: executable ? [] : [root], ...(executable ? { executablePath: executable } : {}), cwd: root, env, timeout: 60000 });
  const problems = [];
  try {
    const first = await app.firstWindow();
    const page = app.windows().find((window) => !window.url().startsWith('devtools:')) ?? first;
    page.setDefaultTimeout(30000);
    await page.waitForLoadState('domcontentloaded');
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (!EXPECTED_ERRORS.some((pattern) => pattern.test(text))) problems.push(`console: ${text.slice(0, 300)}`);
    });

    // Filmul, prezentarea și turul pot apărea cu întârziere după o pornire sau o reîncărcare: așteaptă-le, apoi închide-le pe rând.
    const closeOverlays = async () => {
      await page.waitForTimeout(2500);
      let quietFor = 0;
      for (let i = 0; i < 30 && quietFor < 4; i++) {
        const close = page.getByRole('button', { name: /Închide turul|Închide prezentarea|Sari peste/ }).first();
        if (await close.isVisible()) {
          await close.click();
          quietFor = 0;
        } else {
          quietFor += 1;
        }
        await page.waitForTimeout(400);
      }
    };
    const go = async (route) => {
      await page.evaluate((hash) => { window.location.hash = hash; }, route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
      await closeOverlays();
    };
    // @axe-core/playwright cere o pagină nouă, ceea ce Electron nu acceptă: axe-core se injectează direct în fereastra aplicației.
    const axeSource = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
    const axe = async (label, scope) => {
      // Un element aflat în mijlocul animației de apariție e semitransparent: contrastul măsurat ar fi fals. Așteaptă să se oprească.
      await page.waitForTimeout(900);
      if (!await page.evaluate(() => typeof window.axe === 'object')) await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async ({ tags, scope }) => {
        const result = await window.axe.run(scope ? document.querySelector(scope) ?? document : document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
        return result.violations.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => `${n.target.join(' ').slice(0, 60)} ${n.any[0]?.data?.contrastRatio ? `(${n.any[0].data.fgColor} pe ${n.any[0].data.bgColor}, ${n.any[0].data.contrastRatio}:1)` : ''}`).join(' | ')}`);
      }, { tags: AXE_TAGS, scope });
      expect(violations, `axe: ${label}`).toEqual([]);
      console.log(`PASS axe ${label}`);
    };
    const tourDialog = (pattern) => page.locator('[role="dialog"]').filter({ hasText: pattern });
    const stepThrough = async (dialog, until) => {
      for (let i = 0; i < 12; i++) {
        if (await dialog.getByText(until).first().isVisible().catch(() => false)) return;
        await dialog.getByRole('button', { name: /Continuă|Hai să începem/ }).first().click();
        await page.waitForTimeout(450);
      }
      throw new Error(`Nu am ajuns la pasul ${until}`);
    };

    // 1. Profil nou și date de test, salvate prin același IPC ca aplicația.
    await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden({ timeout: 30000 });
    await page.getByRole('textbox', { name: 'Cum te cheamă?' }).fill('QA Funcții');
    await page.getByRole('button', { name: /Intr/i }).click();
    await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
    await closeOverlays();
    const seeded = seedData(Date.now());
    await page.evaluate(async ({ quizzes, stats }) => {
      const profileId = JSON.parse(localStorage.getItem('studyx-user')).state.activeProfileId;
      await window.electronAPI.storageSave(profileId, 'quizzes', JSON.stringify(quizzes));
      await window.electronAPI.storageSave(profileId, 'stats', JSON.stringify(stats));
    }, seeded);
    await page.reload();
    await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
    await closeOverlays();

    // 2. Cardul „Pentru tine”: subiectul slab primul, cel lăsat în urmă după el, fără „Grile noi” (nu există cheie AI).
    const focus = page.getByRole('region', { name: 'Pentru tine' });
    await expect(focus).toBeVisible();
    await expect(focus.getByText('Aritmii')).toBeVisible();
    await expect(focus.getByText(/10 greșeli din 12 răspunsuri/)).toBeVisible();
    await expect(focus.getByText('Insuficiență cardiacă')).toBeVisible();
    await expect(focus.getByRole('button', { name: /Grile noi/ })).toHaveCount(0);
    console.log('PASS Pentru tine: subiecte, cifre, fără Grile noi fără cheie AI');
    await page.screenshot({ path: path.join(root, '.qa-results', 'features-dashboard.png') });
    await axe('Panou');

    // 3. Exersare: deschide setul, iar setul nu apare în lista de grile.
    await focus.getByRole('button', { name: 'Exersează Aritmii' }).click();
    await expect(page).toHaveURL(/#\/play\//);
    await expect(page.getByText('Exersare: Aritmii').first()).toBeVisible();
    console.log('PASS Exersează pornește sesiunea „Exersare: Aritmii”');
    await go('/quizzes');
    await expect(page.getByText('Insuficiență cardiacă').first()).toBeVisible();
    await expect(page.getByText('Exersare: Aritmii')).toHaveCount(0);
    console.log('PASS setul de exersare nu apare în Grilele mele');

    // 4. Micro-demo-uri în ghiduri: pasul din turul Panoului, Caietul de erori și slide-ul din Prezentare.
    await go('/');
    await page.getByRole('button', { name: 'Vezi turul Panoului' }).click();
    const panou = tourDialog(/Panoul · \d din 8/);
    await stepThrough(panou, 'Subiecte pentru tine');
    await expect(panou.getByRole('figure', { name: 'Demonstrație: cardul Pentru tine' })).toBeVisible();
    await expect(panou.getByRole('button', { name: 'Oprește demonstrația' })).toBeVisible();
    await axe('turul Panoului (pasul cu demo)', '[role="dialog"]');
    await panou.getByRole('button', { name: 'Închide turul' }).first().click();
    console.log('PASS demo în turul Panoului');

    await go('/erori');
    await page.getByRole('button', { name: 'Vezi turul Caietului de erori' }).click();
    const erori = tourDialog(/Caiet de erori · \d din 4/);
    await expect(erori.getByRole('figure', { name: 'Demonstrație: Caietul de erori' })).toBeVisible();
    await axe('turul Caietului de erori', '[role="dialog"]');
    await erori.getByRole('button', { name: 'Închide turul' }).first().click();
    console.log('PASS demo în turul Caietului de erori');

    await go('/');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('studyx:whats-new:open')));
    const slides = page.locator('[role="dialog"]').filter({ hasText: 'StudyX 1.0' });
    await slides.getByRole('button', { name: 'Slide 5' }).click();
    await expect(slides.getByText('Aplicația îți spune ce să exersezi azi')).toBeVisible();
    await expect(slides.getByRole('figure', { name: 'Demonstrație: cardul Pentru tine' })).toBeVisible();
    await page.waitForTimeout(600);
    await axe('Prezentarea 1.0 (slide-ul Pentru tine)', '[role="dialog"]');
    await slides.getByRole('button', { name: 'Închide prezentarea' }).first().click();
    console.log('PASS slide Pentru tine în Prezentare');

    // 5. Chat: „din tratamentul AR” își păstrează subiectul și numărul.
    await page.getByRole('button', { name: 'Deschide chatul AI' }).click();
    const box = page.getByRole('textbox', { name: 'Mesaj pentru AI' });
    await box.fill('fa mi 30 de grile din tratamentul AR, rezidentiat');
    await box.press('Enter');
    await expect(page.getByLabel('Subiectul')).toHaveValue('tratamentul AR');
    await expect(page.getByRole('button', { name: /Generează 30 de grile/ })).toBeVisible();
    console.log('PASS cerere de chat: subiect „tratamentul AR”, 30 de grile');
    await page.keyboard.press('Escape');

    // 6. Accesibilitate pe paginile principale, în ambele teme.
    const pages = ['/', '/quizzes', '/review', '/daily-review', '/stats', '/flashcards', '/vault', '/rezidentiat', '/erori', '/simulare', '/settings?s=aspect', '/settings?s=ajutor'];
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((mode) => localStorage.setItem('studyx-theme-mode', mode), theme);
      await page.reload();
      await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
      await closeOverlays();
      for (const route of pages) {
        await go(route);
        await page.waitForTimeout(500);
        await axe(`${route} (${theme})`);
      }
    }
    await page.screenshot({ path: path.join(root, '.qa-results', 'features-final.png') });

    expect(problems, 'erori neașteptate în consolă').toEqual([]);
    console.log(`PASS fără erori neașteptate în consolă; date izolate: ${data}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
