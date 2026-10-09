export interface Theme {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  surface: string;
  surface2: string;
  modalBg: string;
  border: string;
  border2: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accent2: string;
  /** The accent as small text: darker in the light theme, where #007AFF on white is under 4.5:1. */
  accentText: string;
  success: string;
  danger: string;
  warning: string;
  navBg: string;
  orb1: string;
  orb2: string;
  orb3: string;
  inputBg: string;
  gridColor: string;
  isDark: boolean;
  /**
   * Neutral "ink" tokens that used to be written as `white/5`, `white/10`… in
   * components — invisible on a light surface. They flip with the theme:
   * a faint wash for hovered rows/buttons, a subtle fill for placeholders and
   * switches, a hairline for separators, the scrim behind dialogs, and the
   * base tone of skeleton shimmers.
   */
  hoverFill: string;
  fillSubtle: string;
  hairline: string;
  overlay: string;
  skeleton: string;
  /**
   * Optional overrides for the `--glass-panel`/`--glass-panel-strong`/`--glass-border`
   * CSS variables ThemeContext computes.
   */
  glassPanel?: string;
  glassPanelStrong?: string;
  glassBorder?: string;
  glassHighlight?: string;
}

/**
 * StudyX has two looks, both in the Apple idiom: system-blue accent, hairline
 * separators, translucent chrome over a calm canvas.
 *  - `light` ("Luminos"): macOS — grey canvas, white cards.
 *  - `dark`  ("Întunecat"): near-black canvas, graphite cards.
 * The user picks Luminos / Întunecat / Automat (follow the system); see
 * `ThemeMode` and store/themeStore.ts.
 */
export const THEMES = {
  light: {
    id: 'light',
    name: 'Luminos',
    emoji: '\u{2600}\u{FE0F}',
    bg: '#F5F5F7',
    surface: '#FFFFFF',
    surface2: 'rgba(60, 60, 67, 0.07)',
    modalBg: '#FFFFFF',
    border: 'rgba(60, 60, 67, 0.15)',
    border2: 'rgba(60, 60, 67, 0.26)',
    text: '#1D1D1F',
    text2: '#48484A',
    text3: '#6E6E73',
    accent: '#007AFF',
    accent2: '#5E5CE6',
    accentText: '#0062CC',
    success: '#238636',
    danger: '#D70015',
    warning: '#B25000',
    navBg: 'rgba(236, 236, 241, 0.86)',
    orb1: 'rgba(0, 122, 255, 0.05)',
    orb2: 'rgba(94, 92, 230, 0.04)',
    orb3: 'rgba(52, 199, 89, 0.03)',
    inputBg: '#FFFFFF',
    gridColor: 'rgba(60, 60, 67, 0.03)',
    isDark: false,
    hoverFill: 'rgba(60, 60, 67, 0.06)',
    fillSubtle: 'rgba(60, 60, 67, 0.07)',
    hairline: 'rgba(60, 60, 67, 0.15)',
    overlay: 'rgba(0, 0, 0, 0.34)',
    skeleton: 'rgba(60, 60, 67, 0.08)',
    glassPanel: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.90))',
    glassPanelStrong: 'linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(250, 250, 252, 0.97))',
    glassBorder: 'rgba(60, 60, 67, 0.15)',
    glassHighlight: 'rgba(255, 255, 255, 0.9)',
  },
  dark: {
    id: 'dark',
    name: 'Întunecat',
    emoji: '\u{1F319}',
    bg: '#0B0B0E',
    surface: '#161618',
    surface2: 'rgba(255, 255, 255, 0.07)',
    modalBg: '#1C1C1F',
    border: 'rgba(255, 255, 255, 0.10)',
    border2: 'rgba(255, 255, 255, 0.18)',
    text: '#F5F5F7',
    text2: '#C7C7CC',
    text3: '#8E8E93',
    accent: '#0A84FF',
    accent2: '#5E5CE6',
    accentText: '#0A84FF',
    success: '#30D158',
    danger: '#FF453A',
    warning: '#FF9F0A',
    navBg: 'rgba(20, 20, 23, 0.82)',
    orb1: 'rgba(10, 132, 255, 0.10)',
    orb2: 'rgba(94, 92, 230, 0.08)',
    orb3: 'rgba(48, 209, 88, 0.04)',
    inputBg: '#1C1C1F',
    gridColor: 'rgba(255, 255, 255, 0.03)',
    isDark: true,
    hoverFill: 'rgba(255, 255, 255, 0.06)',
    fillSubtle: 'rgba(255, 255, 255, 0.07)',
    hairline: 'rgba(255, 255, 255, 0.12)',
    overlay: 'rgba(0, 0, 0, 0.55)',
    skeleton: 'rgba(255, 255, 255, 0.08)',
    glassPanel: 'linear-gradient(180deg, rgba(38, 38, 42, 0.72), rgba(24, 24, 27, 0.66))',
    glassPanelStrong: 'linear-gradient(180deg, rgba(44, 44, 48, 0.90), rgba(28, 28, 31, 0.86))',
    glassBorder: 'rgba(255, 255, 255, 0.10)',
    glassHighlight: 'rgba(255, 255, 255, 0.08)',
  },
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;

/** What the user picks. `auto` follows the operating system. */
export type ThemeMode = ThemeId | 'auto';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'auto'];

export const DEFAULT_THEME_MODE: ThemeMode = 'auto';

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

/** Anything unreadable — including the retired theme ids ('glass', 'obsidian', …) — becomes "follow the system". */
export function normalizeThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

/** Next mode when a single button cycles them: Luminos → Întunecat → Automat → Luminos. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
}

/**
 * Next mode for a single cycling button, skipping any step that would look the
 * same as now. With "Automat" on a light OS, "Luminos" is the same picture — a
 * plain cycle made that click look broken, so it took 2–3 presses to see a change.
 */
export function nextVisibleThemeMode(mode: ThemeMode, systemPrefersDark: boolean): ThemeMode {
  const current = resolveThemeMode(mode, systemPrefersDark);
  let candidate = mode;
  for (let step = 0; step < THEME_MODES.length; step += 1) {
    candidate = nextThemeMode(candidate);
    if (resolveThemeMode(candidate, systemPrefersDark) !== current) return candidate;
  }
  return nextThemeMode(mode);
}

export function resolveThemeMode(mode: ThemeMode, systemPrefersDark: boolean): ThemeId {
  if (mode === 'auto') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}
