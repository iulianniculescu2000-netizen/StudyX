import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { THEME_MODE_STORAGE_KEY } from '../store/themeStore';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';

function runBootstrap() {
  // The inline script is a classic script: run it exactly as the browser would.
  new Function(script)();
}

function mockSystemDark(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') ? dark : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('index.html theme bootstrap (no flash on start)', () => {
  const original = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    root.removeAttribute('data-theme-mode');
    root.classList.remove('dark');
    root.style.background = '';
    root.style.colorScheme = '';
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  it('carries exactly the colours and the storage key the app uses', () => {
    expect(script).toContain(THEMES.light.bg);
    expect(script).toContain(THEMES.dark.bg);
    expect(script).toContain(`'${THEME_MODE_STORAGE_KEY}'`);
    expect(html).toContain(`html { background: ${THEMES.light.bg}`);
    expect(html).toContain(`html[data-theme="dark"] { background: ${THEMES.dark.bg}`);
  });

  it('follows the system when nothing is saved (Automat)', () => {
    mockSystemDark(true);
    runBootstrap();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme-mode')).toBe('auto');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    mockSystemDark(false);
    runBootstrap();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('an explicit choice beats the system', () => {
    mockSystemDark(true);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, JSON.stringify({ state: { mode: 'light' }, version: 1 }));
    runBootstrap();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.background).not.toBe('');
  });

  it('survives corrupt or unknown saved values', () => {
    mockSystemDark(false);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, '{not json');
    expect(() => runBootstrap()).not.toThrow();
    localStorage.setItem(THEME_MODE_STORAGE_KEY, JSON.stringify({ state: { mode: 'glass' } }));
    runBootstrap();
    expect(document.documentElement.getAttribute('data-theme-mode')).toBe('auto');
  });
});
