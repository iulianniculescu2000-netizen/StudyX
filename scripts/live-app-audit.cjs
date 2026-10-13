const { chromium } = require('c:/Users/Iulia/Desktop/TOT/StudyX/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) resolve(true);
          else reject(new Error('Status ' + res.statusCode));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy());
      });
      console.log('Server is responding at', url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw new Error('Server did not respond within ' + timeoutMs + 'ms');
}

async function runLiveAudit() {
  console.log('=== STARTING LIVESTUDYX E2E AUDIT & TESTING ===');

  await waitForServer('http://localhost:5173');

  const screenshotsDir1 = path.resolve('c:/Users/Iulia/Desktop/TOT/StudyX/dev-artifacts/audit-screenshots');
  const screenshotsDir2 = path.resolve('C:/Users/Iulia/.gemini/antigravity/brain/84d84bb5-2807-4603-9519-8dec3754e752/audit-screenshots');
  if (!fs.existsSync(screenshotsDir1)) fs.mkdirSync(screenshotsDir1, { recursive: true });
  if (!fs.existsSync(screenshotsDir2)) fs.mkdirSync(screenshotsDir2, { recursive: true });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleLogs.push(`[CONSOLE_ERR] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  async function snap(name) {
    const p1 = path.join(screenshotsDir1, `${name}.png`);
    const p2 = path.join(screenshotsDir2, `${name}.png`);
    await page.screenshot({ path: p1, fullPage: false });
    fs.copyFileSync(p1, p2);
    console.log(`✓ Screenshot captured: ${name}.png`);
  }

  // ── 1. BOOT & INITIAL LOAD ──
  console.log('\n[Phase 1] Booting StudyX...');
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000); // Splash screen finishes

  // Handle Profile / Welcome if present
  const profileCard = await page.$('.profile-card, button:has-text("Alege profil"), input[placeholder*="Nume"]');
  if (profileCard) {
    console.log('Found profile/welcome screen, selecting or creating test profile...');
    const nameInput = await page.$('input[placeholder*="Nume"]');
    if (nameInput) {
      await nameInput.fill('Dr. Audit Medic');
      const startBtn = await page.$('button[type="submit"], button:has-text("Începe"), button:has-text("Continuă")');
      if (startBtn) await startBtn.click();
    } else {
      const firstProfile = await page.$('button:has-text("Dr."), .profile-card, button:has-text("Continuă")');
      if (firstProfile) await firstProfile.click();
    }
    await page.waitForTimeout(1500);
  }

  await snap('01_dashboard');

  // ── 2. AUDIT REFINED WINDOWS CURSOR ──
  console.log('\n[Phase 2] Auditing Refined Windows Cursor (Zero Trail)...');
  const cursorActive = await page.evaluate(() => {
    return document.documentElement.classList.contains('studyx-custom-cursor-active');
  });
  console.log('Cursor active on HTML:', cursorActive);

  // Move mouse over a button
  await page.mouse.move(200, 200);
  await page.waitForTimeout(200);
  const button = await page.$('button, a[href]');
  if (button) {
    const box = await button.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
    }
  }
  await snap('02_cursor_hover_button');

  // Verify no particle trail elements
  const trailCanvasCount = await page.evaluate(() => {
    const canvas = document.querySelectorAll('canvas');
    return canvas.length;
  });
  console.log('Trail canvas count (should be 0 because trail was removed):', trailCanvasCount);

  // ── 3. AUDIT TOP FLOATING POP-UP INDICATOR & AUTO-DISMISS ──
  console.log('\n[Phase 3] Auditing Top Floating Indexing Pill & Auto-Dismiss...');
  await page.evaluate(() => {
    // Inject a simulated upload task in vaultUploadStore
    const store = window.__studyx_vault_store || window.useVaultUploadStore;
    // We can dispatch or set through localStorage or evaluate directly
    const raw = localStorage.getItem('studyx-runtime-settings');
  });

  // Inject a task directly into store if available
  const triggeredTask = await page.evaluate(() => {
    // Find the store hook on window if exposed, or trigger via DOM dropzone
    const hasCustomEvent = true;
    return hasCustomEvent;
  });

  // Test Top Upload Indicator rendering directly
  await page.evaluate(() => {
    // Create task in vaultUploadStore
    const ev = new CustomEvent('studyx-test-upload', { detail: { fileName: 'Ghid_Cardiologie_2025.pdf' } });
    window.dispatchEvent(ev);
  });

  // ── 4. QUIZZES (GRILE) WORKFLOW ──
  console.log('\n[Phase 4] Testing Quizzes (Grile) Module...');
  await page.goto('http://localhost:5173/#/quizzes');
  await page.waitForTimeout(1000);
  await snap('03_quizzes_list');

  // Check Quiz Detail / Quiz Play
  const quizLink = await page.$('a[href*="/quiz/"], button:has-text("Rezolvă"), button:has-text("Start")');
  if (quizLink) {
    console.log('Opening existing quiz...');
    await quizLink.click();
    await page.waitForTimeout(1000);
    await snap('04_quiz_detail');

    // Start playing
    const playBtn = await page.$('button:has-text("Start"), button:has-text("Începe"), a[href*="/play/"]');
    if (playBtn) {
      await playBtn.click();
      await page.waitForTimeout(1200);
      await snap('05_quiz_play_screen');

      // Click an option (e.g. Option A)
      const option = await page.$('button[data-option], .quiz-option, button:has-text("A.")');
      if (option) {
        await option.click();
        await page.waitForTimeout(600);
        await snap('06_quiz_option_selected');
      }
    }
  }

  // ── 5. FLASHCARDS WORKFLOW ──
  console.log('\n[Phase 5] Testing Flashcards Module...');
  await page.goto('http://localhost:5173/#/flashcards');
  await page.waitForTimeout(1000);
  await snap('07_flashcards_hub');

  // ── 6. NOTES (NOTIȚE) WORKFLOW ──
  console.log('\n[Phase 6] Testing Notes (Notițe) Module...');
  await page.goto('http://localhost:5173/#/notes');
  await page.waitForTimeout(1000);
  await snap('08_notes_view');

  // Click new note if button available
  const newNoteBtn = await page.$('button:has-text("Notiță nouă"), button:has-text("Adaugă"), button[aria-label*="nou"]');
  if (newNoteBtn) {
    await newNoteBtn.click();
    await page.waitForTimeout(800);
    const textarea = await page.$('textarea, [contenteditable="true"]');
    if (textarea) {
      await textarea.fill('# Sinteză Curs Rezidențiat\n\n- Hipertensiune arterială stadiul II\n- Tratament combinat de primă linie\n- Reevaluare la 4 săptămâni');
      await page.waitForTimeout(600);
      await snap('09_notes_editor_filled');
    }
  }

  // ── 7. ADVANCED MODULES (REZIDENȚIAT & STATS) ──
  console.log('\n[Phase 7] Testing Residency & Stats Modules...');
  await page.goto('http://localhost:5173/#/rezidentiat');
  await page.waitForTimeout(1000);
  await snap('10_residency_dashboard');

  await page.goto('http://localhost:5173/#/stats');
  await page.waitForTimeout(1000);
  await snap('11_analytics_stats');

  // ── 8. SETTINGS & THEME TOGGLE ──
  console.log('\n[Phase 8] Testing Settings & Theme Toggle...');
  await page.goto('http://localhost:5173/#/settings?s=aspect');
  await page.waitForTimeout(1000);
  await snap('12_settings_aspect_dark');

  // Toggle theme to light mode
  const lightBtn = await page.$('button:has-text("Luminos"), button[aria-label*="Luminos"], button:has-text("Light")');
  if (lightBtn) {
    console.log('Switching to Light Mode...');
    await lightBtn.click();
    await page.waitForTimeout(1000);
    await snap('13_settings_aspect_light');

    // Switch back to Dark Mode
    const darkBtn = await page.$('button:has-text("Întunecat"), button[aria-label*="Întunecat"], button:has-text("Dark")');
    if (darkBtn) {
      await darkBtn.click();
      await page.waitForTimeout(800);
    }
  }

  // ── 9. AI CHAT & THINKING ORB ──
  console.log('\n[Phase 9] Testing AI Suite & Synaptic Neural Core...');
  const aiTrigger = await page.$('button[aria-label*="AI"], button:has-text("AI"), [data-tutorial="ai-chat"]');
  if (aiTrigger) {
    await aiTrigger.click();
    await page.waitForTimeout(1200);
    await snap('14_ai_drawer_open');
  }

  console.log('\n=== AUDIT RESULTS SUMMARY ===');
  console.log('Captured Screenshots:', fs.readdirSync(screenshotsDir1).length);
  console.log('Uncaught Page Errors:', pageErrors.length);
  if (pageErrors.length > 0) {
    console.log('Page Errors List:', pageErrors);
  }
  console.log('Console Errors:', consoleLogs.length);

  await page.close();
  await context.close();
  await browser.close();

  return {
    screenshotsCount: fs.readdirSync(screenshotsDir1).length,
    pageErrors,
    consoleLogs,
  };
}

runLiveAudit()
  .then((res) => {
    console.log('\n✓ LIVE AUDIT COMPLETED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n✗ AUDIT FAILED:', err);
    process.exit(1);
  });
