import { beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { THEME_MODE_STORAGE_KEY, useThemeStore } from './themeStore';
import { ThemeProvider } from '../theme/ThemeContext';
import { DEFAULT_THEME_MODE, THEMES, normalizeThemeMode, resolveThemeMode, nextVisibleThemeMode } from '../theme/themes';

describe('theme mode', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ mode: DEFAULT_THEME_MODE });
  });

  it('starts on "auto" and remembers a choice', async () => {
    expect(useThemeStore.getState().mode).toBe('auto');
    act(() => useThemeStore.getState().setMode('dark'));
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(JSON.parse(localStorage.getItem(THEME_MODE_STORAGE_KEY)!).state.mode).toBe('dark');
  });

  it('treats retired theme ids and garbage as "follow the system"', () => {
    for (const legacy of ['glass', 'obsidian', 'pearl', 'bigsur', 'aurora', 'midnight', 'amber', undefined, 42, null]) {
      expect(normalizeThemeMode(legacy)).toBe('auto');
    }
    expect(normalizeThemeMode('light')).toBe('light');
  });

  it('rejects an invalid mode passed to setMode', () => {
    act(() => useThemeStore.getState().setMode('purple' as never));
    expect(useThemeStore.getState().mode).toBe('auto');
  });

  it('resolves auto from the system, fixed modes ignore it', () => {
    expect(resolveThemeMode('auto', true)).toBe('dark');
    expect(resolveThemeMode('auto', false)).toBe('light');
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
  });
});

describe('ThemeProvider applies the resolved theme to <html>', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });

  it('writes theme attributes, color-scheme, the dark class and the ink tokens', () => {
    useThemeStore.setState({ mode: 'dark' });
    const view = render(<ThemeProvider><span /></ThemeProvider>);
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-theme-mode')).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--hover-fill')).toBe(THEMES.dark.hoverFill);
    view.unmount();

    act(() => useThemeStore.getState().setMode('light'));
    render(<ThemeProvider><span /></ThemeProvider>);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.getPropertyValue('--hairline')).toBe(THEMES.light.hairline);
  });
});

describe('nextVisibleThemeMode', () => {
  it('never returns a mode that looks the same as the current one', () => {
    for (const systemDark of [false, true]) {
      for (const mode of ['light', 'dark', 'auto'] as const) {
        const next = nextVisibleThemeMode(mode, systemDark);
        expect(resolveThemeMode(next, systemDark)).not.toBe(resolveThemeMode(mode, systemDark));
      }
    }
  });

  it('from Automat on a light system goes straight to Întunecat', () => {
    expect(nextVisibleThemeMode('auto', false)).toBe('dark');
    expect(nextVisibleThemeMode('auto', true)).toBe('light');
  });
});
