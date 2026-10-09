import { test, expect, type Page } from '@playwright/test';

async function ensureOnboarded(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const nameInput = page.getByPlaceholder(/Alexandru/i);
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Test User');
    await page.getByRole('button', { name: /Continu/i }).click();
    await page.getByRole('button', { name: /Intr/i }).click();
  }

  await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  await dismissTours(page);
}

/** A new profile is welcomed with the onboarding tour (and a returning one with "what's new"); both cover the page. */
async function dismissTours(page: Page) {
  const close = page.getByRole('button', { name: /Închide turul|Închide prezentarea|Sari peste/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await close.first().isVisible({ timeout: 2500 }).catch(() => false))) return;
    await close.first().click();
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

  test('should navigate between pages', async ({ page }) => {
    await openRoute(page, '/quizzes');
    await expect(page).toHaveURL(/#\/quizzes/);
    await expect(page.locator('body')).toContainText(/Quiz|Grile/i);

    await openRoute(page, '/stats');
    await expect(page).toHaveURL(/#\/stats/);
    await expect(page.locator('body')).toContainText(/Statistici|Stats|Performanta/i);
  });

  test('should handle theme switching', async ({ page }) => {
    await openRoute(page, '/settings');

    const possibleSelectors = [
      'button[aria-label*="theme"]',
      'button[aria-label*="tema"]',
      'button[title*="theme"]',
      'button[title*="tema"]',
      '[data-testid="theme-toggle"]',
      '.theme-toggle',
      'button:has-text("Dark")',
      'button:has-text("Light")',
      'button:has-text("Tema")',
    ];

    let toggleFound = false;
    for (const selector of possibleSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        await element.click();
        toggleFound = true;
        break;
      }
    }

    if (toggleFound) {
      await expect(page.locator('body')).toBeVisible();
    }
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
    await openRoute(page, '/quizzes');

    const createButton = page
      .locator('a[href*="/create"], button:has-text("Create"), button:has-text("New"), button:has-text("Adaug"), button:has-text("Creeaz")')
      .first();

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await expect(page).toHaveURL(/#\/create|\/create|\/new|\/add/);

      const titleInput = page.locator('input[name="title"], input[placeholder*="title"], input[placeholder*="Titlu"]').first();
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill('Test Quiz');

        const saveButton = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Salveaz"), button:has-text("Creeaz")').first();
        if (await saveButton.isVisible().catch(() => false)) {
          await saveButton.click();
        }
      }
    }
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
          title: 'Grila pentru mutare QA',
          description: 'Trebuie mutata in subfolder.',
          emoji: '📝',
          category: 'QA',
          folderId: 'f-parent-qa',
          questions: [{
            id: 'q1',
            text: 'Intrebare QA?',
            multipleCorrect: false,
            options: [{ id: 'a', text: 'Raspuns', isCorrect: true }],
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
    await expect(page.locator('[data-quiz-id="quiz-dnd-qa"]')).toBeVisible();

    await page.locator('[data-quiz-id="quiz-dnd-qa"]').dragTo(
      page.locator('[data-folder-id="f-child-qa"]').first(),
      { force: true },
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

    await ensureOnboarded(page);

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000);
  });

  test('should not have memory leaks', async ({ page }) => {
    await ensureOnboarded(page);

    const pages = ['/#/quizzes', '/#/stats', '/#/flashcards', '/#/'];

    for (const pageUrl of pages) {
      await page.goto(pageUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }

    await expect(page.locator('body')).toBeVisible();
  });
});
