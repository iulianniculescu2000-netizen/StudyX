import { createContext, useContext, useEffect, useState, useRef, useSyncExternalStore, type ReactNode, useLayoutEffect, useCallback } from 'react';
import { THEMES, resolveThemeMode, type Theme, type ThemeId } from './themes';
import { detectDeviceCapabilities, resolvePerformanceProfile } from '../lib/deviceTier';
import { notifyNativeTheme } from '../lib/nativeTheme';
import { useRuntimeStore } from '../store/runtimeStore';
import { useThemeStore } from '../store/themeStore';

const ThemeContext = createContext<Theme>(THEMES.dark);

function usePerformanceProfile() {
  const performanceMode = useRuntimeStore((state) => state.performanceMode);
  const lowPowerMode = useRuntimeStore((state) => state.lowPowerMode);
  const getProfile = useCallback(
    () => resolvePerformanceProfile(detectDeviceCapabilities(), performanceMode, lowPowerMode),
    [performanceMode, lowPowerMode],
  );
  const [profile, setProfile] = useState<'full' | 'lite'>(getProfile);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setProfile(getProfile());
    update();
    motionQuery.addEventListener('change', update);
    window.addEventListener('resize', update, { passive: true });
    return () => {
      motionQuery.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [performanceMode, lowPowerMode, getProfile]);

  return profile;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeSystemDark(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function readSystemDark(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY).matches : false;
}

/** Live "the OS is in dark mode" flag, used when the user picked Automat. */
function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystemDark, readSystemDark, () => false);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const performanceProfile = usePerformanceProfile();
  const lowPowerMode = useRuntimeStore((state) => state.lowPowerMode);
  const mode = useThemeStore((state) => state.mode);
  const systemDark = useSystemPrefersDark();
  const resolved: ThemeId = resolveThemeMode(mode, systemDark);
  const theme = THEMES[resolved];
  const prevThemeRef = useRef<ThemeId | null>(null);

  // useLayoutEffect so the change lands before the browser paints
  useLayoutEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;

      const vars = {
        '--bg': theme.bg,
        '--surface': theme.surface,
        '--surface2': theme.surface2,
        '--border': theme.border,
        '--border2': theme.border2,
        '--text': theme.text,
        '--text2': theme.text2,
        '--text3': theme.text3,
        '--accent': theme.accent,
        '--accent2': theme.accent2,
        '--accent-text': theme.accentText,
        '--success': theme.success,
        '--success-fill': theme.successFill,
        '--danger': theme.danger,
        '--warning': theme.warning,
        '--nav-bg': theme.navBg,
        '--input-bg': theme.inputBg,
        // Neutral ink tokens — use these instead of white/5, white/10… so both themes read correctly.
        '--hover-fill': theme.hoverFill,
        '--fill-subtle': theme.fillSubtle,
        '--hairline': theme.hairline,
        '--overlay': theme.overlay,
        '--skeleton': theme.skeleton,
        '--glass-bg': theme.isDark ? 'rgba(28,28,30,0.65)' : 'rgba(255,255,255,0.72)',
        '--glass-panel': theme.glassPanel ?? (theme.isDark
          ? 'linear-gradient(180deg, rgba(38,38,42,0.72), rgba(28,28,30,0.58))'
          : `linear-gradient(180deg, color-mix(in srgb, ${theme.surface} 96%, rgba(255,255,255,0.95)), color-mix(in srgb, ${theme.surface2} 94%, rgba(255,255,255,0.55)))`),
        '--glass-panel-strong': theme.glassPanelStrong ?? (theme.isDark
          ? 'linear-gradient(180deg, rgba(44,44,48,0.88), rgba(30,30,33,0.78))'
          : `linear-gradient(180deg, color-mix(in srgb, ${theme.modalBg} 96%, rgba(255,255,255,0.98)), color-mix(in srgb, ${theme.surface2} 88%, rgba(255,255,255,0.92)))`),
        '--glass-border': theme.glassBorder ?? (theme.isDark ? 'rgba(255,255,255,0.12)' : `color-mix(in srgb, ${theme.border2} 74%, rgba(255,255,255,0.55))`),
        '--glass-highlight': theme.glassHighlight ?? (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'),
        // Faint sheen for gradients drawn OVER content (never the 90%-white highlight line, which would veil text).
        '--glass-sheen': theme.isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.10)',
        '--shadow-color': `rgb(var(--shadow-rgb) / ${theme.isDark ? 0.42 : 0.12})`,
        '--shadow-color-soft': `rgb(var(--shadow-rgb) / ${theme.isDark ? 0.24 : 0.075})`,
        '--focus-ring': theme.isDark ? 'rgba(10,132,255,0.7)' : `color-mix(in srgb, ${theme.accent} 60%, transparent)`,
        '--accent-glow': `color-mix(in srgb, ${theme.accent} ${theme.isDark ? '34%' : '22%'}, transparent)`,
        '--accent-soft': `color-mix(in srgb, ${theme.accent} 11%, transparent)`,
        '--selection': theme.accent,
        '--shell-gutter': performanceProfile === 'lite' ? '18px' : '24px',
        '--shell-curve': performanceProfile === 'lite' ? '24px' : '32px',
      };

      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
      root.setAttribute('data-theme', theme.isDark ? 'dark' : 'light');
      root.setAttribute('data-theme-id', theme.id);
      root.setAttribute('data-theme-mode', mode);
      root.setAttribute('data-performance', performanceProfile);
      root.setAttribute('data-power-save', lowPowerMode ? 'true' : 'false');
      root.setAttribute('data-device-tier', detectDeviceCapabilities().tier);
      // Native form controls, scrollbars and Tailwind's `dark:` variants follow the resolved theme.
      root.style.colorScheme = theme.isDark ? 'dark' : 'light';
      root.classList.toggle('dark', theme.isDark);
      document.body.style.background = theme.bg;
      document.body.style.color = theme.text;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
      notifyNativeTheme(mode, resolved, theme.bg);
    };

    // Premium View Transitions API (Chrome 111+ / Electron 25+)
    if (
      prevThemeRef.current &&
      prevThemeRef.current !== resolved &&
      'startViewTransition' in document
    ) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        applyTheme();
      });
    } else {
      // Fallback instantaneu pentru viteza maxima
      applyTheme();
    }

    prevThemeRef.current = resolved;
  }, [theme, resolved, mode, performanceProfile, lowPowerMode]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export type { ThemeId };
