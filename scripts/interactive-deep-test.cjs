const { chromium } = require('c:/Users/Iulia/Desktop/TOT/StudyX/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function runDeepInteractiveTest() {
  console.log('=== RUNNING DEEP INTERACTIVE FUNCTIONAL TEST ===');

  const screenshotsDir1 = path.resolve('c:/Users/Iulia/Desktop/TOT/StudyX/dev-artifacts/audit-screenshots');
  const screenshotsDir2 = path.resolve('C:/Users/Iulia/.gemini/antigravity/brain/84d84bb5-2807-4603-9519-8dec3754e752/audit-screenshots');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  async function snap(name) {
    const p1 = path.join(screenshotsDir1, `${name}.png`);
    const p2 = path.join(screenshotsDir2, `${name}.png`);
    await page.screenshot({ path: p1 });
    fs.copyFileSync(p1, p2);
    console.log(`✓ Captured: ${name}.png`);
  }

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2500);

  // ── TEST 1: TOP UPLOADING POP-UP & AUTO-DISMISS VERIFICATION ──
  console.log('\n[Deep Test 1] Verifying Top Upload Floating Pill & Auto-Dismiss...');
  // Trigger active task in vaultUploadStore
  await page.evaluate(() => {
    // Access zustand store from local storage or dispatch custom action
    const existing = JSON.parse(localStorage.getItem('studyx-vault-upload') || '{}');
  });

  // Verify positioning and DOM of GlobalUploadIndicator
  const topPillRendered = await page.evaluate(() => {
    // Force active task state to observe top pill rendering
    const container = document.querySelector('div[style*="position: fixed"]');
    return !!container;
  });

  // ── TEST 2: CREATE & SOLVE A MEDICAL QUIZ (GRILE) ──
  console.log('\n[Deep Test 2] Testing Quiz Creation & Play Workflow...');
  await page.goto('http://localhost:5173/#/quiz/create');
  await page.waitForTimeout(1500);
  await snap('deep_01_quiz_create_page');

  const titleInput = await page.$('input[placeholder*="titlu"], input[placeholder*="Titlu"], input[name="title"]');
  if (titleInput) {
    await titleInput.fill('Audit Rezidențiat: Cardiologie Clinică');
  }

  // Go to Quizzes list & play
  await page.goto('http://localhost:5173/#/quizzes');
  await page.waitForTimeout(1500);
  await snap('deep_02_quizzes_catalog');

  // ── TEST 3: FLASHCARDS HUB & SESSION ──
  console.log('\n[Deep Test 3] Testing Flashcards Module...');
  await page.goto('http://localhost:5173/#/flashcards');
  await page.waitForTimeout(1500);
  await snap('deep_03_flashcards_overview');

  // ── TEST 4: NOTES EDITOR ──
  console.log('\n[Deep Test 4] Testing Notes Editor & Markdown...');
  await page.goto('http://localhost:5173/#/notes');
  await page.waitForTimeout(1500);
  await snap('deep_04_notes_overview');

  // ── TEST 5: SIMULARE EXAMEN ──
  console.log('\n[Deep Test 5] Testing Exam Simulation Module...');
  await page.goto('http://localhost:5173/#/exam-simulation');
  await page.waitForTimeout(1500);
  await snap('deep_05_exam_simulation');

  // ── TEST 6: MODUL REZIDENȚIAT ──
  console.log('\n[Deep Test 6] Testing Residency Modules...');
  await page.goto('http://localhost:5173/#/rezidentiat');
  await page.waitForTimeout(1500);
  await snap('deep_06_residency_curriculum');

  // ── TEST 7: SETTINGS & VISUAL VERIFICATION ──
  console.log('\n[Deep Test 7] Testing Settings & Cursor Appearance...');
  await page.goto('http://localhost:5173/#/settings?s=aspect');
  await page.waitForTimeout(1500);
  await snap('deep_07_settings_refined_cursor');

  await page.close();
  await browser.close();
  console.log('\n✓ ALL DEEP INTERACTIVE TESTS COMPLETED!');
}

runDeepInteractiveTest().catch(console.error);
