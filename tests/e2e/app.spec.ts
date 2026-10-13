import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function ensureOnboarded(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden({ timeout: 15000 });

  const nameInput = page.getByRole('textbox', { name: 'Cum te cheamă?' });
  // Initial hydration and the splash can finish after network requests settle.
  await expect(nameInput.or(page.locator('main'))).toBeVisible({ timeout: 15000 });
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.pressSequentially('Test User');
    await expect(page.getByText('Salut, Test User! Arată bine.')).toBeVisible();
    await page.getByRole('button', { name: /Intr/i }).click();
  }

  await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  await dismissTours(page);
}

/** A new profile is welcomed with the onboarding tour (and a returning one with "what's new"); both cover the page. */
async function dismissTours(page: Page) {
  const close = page.getByRole('button', { name: /Închide turul|Închide prezentarea|Sari peste/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // isVisible does not wait; the lazy first-run film can mount after main.
    if (!(await close.first().waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false))) return;
    await close.first().click();
    await page.waitForTimeout(100);
  }
}

async function openRoute(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
}

test.describe('StudyX Application', () => {
  test.beforeEach(async ({ page }) => {
    await ensureOnboarded(page);
  });

  test('should load the main dashboard', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/StudyX|Dashboard|Astazi|Salut/i);
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible();

    const navigationItems = page.locator('a[href*="#/"], a[href*="/"]');
    await expect(navigationItems.first()).toBeVisible();
  });

  test('dashboard controls meet automated accessibility checks', async ({ page }) => {
    for (const [label, mode] of [['Luminos', 'light'], ['Întunecat', 'dark']] as const) {
      await openRoute(page, '/settings?s=aspect');
      await page.getByRole('radio', { name: label, exact: true }).click();
      await openRoute(page, '/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.map(({ id, impact, nodes }) => ({
        mode,
        id,
        impact,
        elements: nodes.map(({ target, any }) => ({ target: target.join(' '), details: any.map(({ data }) => data) })),
      }))).toEqual([]);
    }
  });

  test('should navigate between pages', async ({ page }) => {
    await openRoute(page, '/quizzes');
    await expect(page).toHaveURL(/#\/quizzes/);
    await expect(page.locator('body')).toContainText(/Quiz|Grile/i);

    await openRoute(page, '/stats');
    await expect(page).toHaveURL(/#\/stats/);
    await expect(page.locator('body')).toContainText(/Statistici|Stats|Performanta/i);
  });

  test('should handle theme switching', async ({ page }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const [label, mode] of [['Luminos', 'light'], ['Întunecat', 'dark']]) {
      await openRoute(page, '/settings?s=aspect');
      await page.getByRole('radio', { name: label, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await openRoute(page, '/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden();
      await page.screenshot({ path: `.qa-results-brave/dashboard-${mode}.png` });
    }
  });

  test('film pauses visuals and narration, seeks scenes and supports small windows', async ({ page }) => {
    test.setTimeout(120000);
    await page.evaluate(() => window.dispatchEvent(new Event('studyx:welcome-film:open')));
    const film = page.locator('[role="dialog"][data-film-scene]');
    await expect(film).toHaveAttribute('data-film-playing', 'true', { timeout: 20000 });
    await expect(film.locator('audio')).toHaveJSProperty('muted', true);
    await film.getByRole('button', { name: 'Pornește narațiunea' }).click();
    await expect(film.locator('audio')).toHaveJSProperty('paused', false);
    await film.getByRole('button', { name: 'Pauză film' }).click();
    const paused = await film.getAttribute('data-film-elapsed-ms');
    await page.waitForTimeout(700);
    await expect(film).toHaveAttribute('data-film-elapsed-ms', paused!);
    await expect(film.locator('audio')).toHaveJSProperty('paused', true);
    await page.screenshot({ path: '.qa-results-brave/intro-cinematic.png' });
    await film.getByRole('button', { name: 'Scena 3: Flashcarduri' }).click();
    await expect(film).toHaveAttribute('data-film-scene', 'cards');
    await expect(film).toHaveAttribute('data-film-scene-elapsed-ms', '0');
    await film.getByRole('button', { name: 'Continuă filmul' }).click();
    await expect(film.locator('audio')).toHaveJSProperty('paused', false);
    await page.setViewportSize({ width: 375, height: 600 });
    await expect(film.getByRole('button', { name: 'Pauză film' })).toBeInViewport();
    await film.getByRole('button', { name: 'Pauză film' }).click();
    const bounds = await film.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(375);
    expect(bounds!.height).toBeLessThanOrEqual(600);
    await page.screenshot({ path: '.qa-results-brave/intro-small.png' });
    await page.keyboard.press('Escape');
    await expect(film).toHaveCount(0);
  });

  test('should show keyboard shortcuts modal', async ({ page }) => {
    await page.keyboard.press('?');

    const modal = page.locator('[role="dialog"], .modal, [data-testid="shortcuts-modal"]');
    const isVisible = await modal.isVisible().catch(() => false);

    if (isVisible) {
      await expect(modal).toContainText(/shortcuts|keyboard|scurt/i);
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
    }
  });

  test('should handle responsive design', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('main')).toBeVisible();

    const mobileMenu = page.locator('button[aria-label="menu"], .mobile-menu-toggle');
    if (await mobileMenu.isVisible().catch(() => false)) {
      await mobileMenu.click();
      await expect(page.locator('.mobile-nav, [role="navigation"] ul')).toBeVisible();
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('main')).toBeVisible();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('main')).toBeVisible();
  });

  test('should handle quiz creation flow', async ({ page }) => {
    test.setTimeout(120000);
    await openRoute(page, '/create');
    await page.getByPlaceholder('ex: Capitalele Europei').fill('Grilă QA izolată');
    await page.getByPlaceholder('Descrie pe scurt conținutul grilei...').fill('Verificarea salvării și studiului.');
    await page.getByRole('button', { name: 'Continuă și adaugă întrebări' }).click();
    await page.getByPlaceholder('Scrie întrebarea ta...').fill('Care este răspunsul corect QA?');
    for (const [letter, answer] of [['A', 'Corect QA'], ['B', 'Alternativa B'], ['C', 'Alternativa C'], ['D', 'Alternativa D']]) {
      await page.getByPlaceholder(`Opțiunea ${letter}...`).fill(answer);
    }
    await page.getByRole('button', { name: 'Marchează opțiunea A ca fiind corectă' }).click();
    await page.getByRole('button', { name: 'Salvează grila', exact: true }).click();
    await expect(page).toHaveURL(/#\/(quizzes|folder\/)/);
    await expect(page.getByText('Grilă QA izolată', { exact: true }).first()).toBeVisible();
    // Real reload verifies persisted data rather than React state alone.
    await page.reload();
    await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden({ timeout: 15000 });
    await dismissTours(page);
    await page.getByText('Grilă QA izolată', { exact: true }).first().click();
    await page.getByRole('link', { name: 'Începe Grila' }).click();
    await page.getByRole('button', { name: /Corect QA/ }).click();
    await page.getByRole('button', { name: 'Verifică răspunsul' }).click();
    await page.getByRole('button', { name: /Știam sigur/ }).click();
    await expect(page).toHaveURL(/#\/results\//);
    await expect(page.locator('main')).toContainText('100');
    await page.reload();
    await expect(page.locator('main')).toContainText('100');
  });

  test('should drag a quiz into a subfolder', async ({ page }) => {
    const now = Date.now();
    const profileId = `qa-dnd-${now}`;

    await page.evaluate(({ profileId, now }) => {
      localStorage.setItem('studyx-user', JSON.stringify({
        state: {
          profiles: [{
            id: profileId,
            username: 'QA DnD',
            gradient: 'linear-gradient(135deg,#0A84FF,#5E5CE6)',
            createdAt: now,
          }],
          activeProfileId: profileId,
          pendingTutorialProfileId: null,
          username: 'QA DnD',
        },
        version: 4,
      }));
      // Tours already seen, so none opens over the drag.
      const seen = Object.fromEntries(['onboarding', 'welcomeFilm', 'whatsNew', 'residency', 'flashcards', 'vault'].map((tour) => [tour, '1.0.0']));
      localStorage.setItem('studyx-tutorial-v2', JSON.stringify({ state: { seen: { [profileId]: seen } }, version: 3 }));
      localStorage.setItem(`studyx-p-${profileId}-folders`, JSON.stringify({
        folders: [
          { id: 'f-parent-qa', name: 'Folder QA', emoji: '📁', color: 'blue', parentId: null, createdAt: now },
          { id: 'f-child-qa', name: 'Subfolder QA', emoji: '🧠', color: 'purple', parentId: 'f-parent-qa', createdAt: now + 1 },
        ],
      }));
      localStorage.setItem(`studyx-p-${profileId}-quizzes`, JSON.stringify({
        quizzes: [{
          id: 'quiz-dnd-qa',
          kind: 'quiz',
          title: 'Grila pentru mutare QA',
          description: 'Trebuie mutata in subfolder.',
          emoji: '📝',
          category: 'QA',
          folderId: 'f-parent-qa',
          questions: [{
            id: 'q1',
            text: 'Intrebare QA?',
            multipleCorrect: false,
            options: [{ id: 'a', text: 'Raspuns', isCorrect: true }, { id: 'b', text: 'Distractor', isCorrect: false }],
          }],
          createdAt: now,
          color: 'blue',
        }],
        sessions: [],
      }));
      localStorage.setItem(`studyx-p-${profileId}-stats`, JSON.stringify({
        questionStats: {},
        streak: { currentStreak: 0, longestStreak: 0, lastStudyDate: '', studyDates: [] },
        totalStudyTime: 0,
      }));
      localStorage.setItem(`studyx-p-${profileId}-notes`, JSON.stringify({ notes: {} }));
    }, { profileId, now });

    await page.goto(`/?qa=${now}#/folder/f-parent-qa`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden();
    await expect(page.locator('[data-quiz-id="quiz-dnd-qa"]')).toBeVisible();

    await page.locator('[data-quiz-id="quiz-dnd-qa"]').dragTo(
      page.locator('[data-folder-id="f-child-qa"]').first(),
    );

    await expect(page.getByText('Am mutat "Grila pentru mutare QA"')).toBeVisible();
    await openRoute(page, '/folder/f-child-qa');
    await expect(page.getByText('Grila pentru mutare QA')).toBeVisible();
  });

  test('should handle AI chat functionality', async ({ page }) => {
    const chatButton = page.locator('button:has-text("AI"), button[aria-label*="chat"], .chat-toggle').first();

    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();

      const chatInterface = page.locator('.chat-interface, [role="dialog"], .ai-chat');
      const isVisible = await chatInterface.isVisible().catch(() => false);

      if (isVisible) {
        const messageInput = page.locator('textarea[placeholder*="message"], textarea, input[type="text"], .chat-input').first();
        if (await messageInput.isVisible().catch(() => false)) {
          await messageInput.fill('Hello AI');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
        }

        const closeButton = page.locator('button[aria-label="close"], button[aria-label="Close"], .close-button').first();
        if (await closeButton.isVisible().catch(() => false)) {
          await closeButton.click();
        }
      }
    }
  });

  test('should handle accessibility features', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 5); i += 1) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();

      expect(ariaLabel || (text && text.trim().length > 0)).toBeTruthy();
    }

    const hasSemanticElements = await Promise.all([
      page.locator('main').isVisible().catch(() => false),
      page.locator('nav').isVisible().catch(() => false),
      page.locator('header').isVisible().catch(() => false),
    ]);

    expect(hasSemanticElements.some(Boolean)).toBe(true);
  });

  test('should handle error states gracefully', async ({ page }) => {
    await page.goto('/#/non-existent-page');
    await page.waitForLoadState('networkidle');

    const isRedirected = !page.url().includes('/non-existent-page');
    const bodyText = await page.locator('body').textContent();
    const hasFallbackContent = /StudyX|Dashboard|Astazi|Salut/i.test(bodyText ?? '');

    expect(isRedirected || hasFallbackContent).toBe(true);
  });

  test('should handle loading states', async ({ page }) => {
    await openRoute(page, '/stats');

    const loadingIndicators = page.locator('.loading, .spinner, [aria-busy="true"], .skeleton');
    const hasLoading = await loadingIndicators.isVisible().catch(() => false);

    if (hasLoading) {
      await expect(loadingIndicators).not.toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('StudyX Performance', () => {
  test('should load within reasonable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await expect(page.getByRole('status', { name: 'Se pornește StudyX' })).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Cum te cheamă?' })).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000);
  });

  test('should revisit key pages without rendering errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await ensureOnboarded(page);

    const pages = ['/#/quizzes', '/#/stats', '/#/flashcards', '/#/'];

    for (const pageUrl of pages) {
      await page.goto(pageUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }

    await expect(page.locator('body')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
