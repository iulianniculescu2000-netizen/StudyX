import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 3 : undefined,
  /* Timeouts: per test and for the whole run (CI). */
  timeout: 30 * 1000,
  expect: { timeout: 7 * 1000 },
  globalTimeout: process.env.CI ? 18 * 60 * 1000 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure */
    video: process.env.STUDYX_TEST_BROWSER ? 'off' : 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      // Vizual: același aspect pe laptop (1536×816, 125%), ferestre mici și ambele teme. Folosește Brave, fiindcă
      // descărcarea Chromium e blocată pe această mașină; STUDYX_TEST_BROWSER îl poate înlocui (Edge, Chrome).
      name: 'visual',
      testDir: './tests/visual',
      timeout: 120 * 1000,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1.25,
        video: 'off',
        launchOptions: {
          executablePath: process.env.STUDYX_TEST_BROWSER || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
        },
      },
    },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional installed Chromium browser (for example Brave) for local QA.
        launchOptions: process.env.STUDYX_TEST_BROWSER
          ? { executablePath: process.env.STUDYX_TEST_BROWSER }
          : {},
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Test against branded browsers. */
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
