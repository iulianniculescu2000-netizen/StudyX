import { useId } from 'react';
import { motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useThemeStore } from '../store/themeStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { spring } from '../theme/motion';
import { THEME_MODES, nextVisibleThemeMode, type ThemeMode } from '../theme/themes';

const LABELS: Record<ThemeMode, string> = {
  light: 'Luminos',
  dark: 'Întunecat',
  auto: 'Automat',
};

const ICONS: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, auto: Monitor };

/**
 * Luminos / Întunecat / Automat.
 *  - `segmented`: the Apple-style control with a sliding pill (Settings, onboarding).
 *  - `compact`: one small round button that cycles the three modes (sidebar, corners).
 */
export default function ThemeModeSwitcher({ variant = 'segmented', label }: { variant?: 'segmented' | 'compact'; label?: string }) {
  const theme = useTheme();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const { calmMotion } = useAdaptiveMotion();
  const pillId = useId();

  if (variant === 'compact') {
    const Icon = ICONS[mode];
    const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const cycle = () => setMode(nextVisibleThemeMode(mode, systemDark));
    const circle = (
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--fill-subtle)', color: theme.text2, border: `0.5px solid ${theme.hairline}` }}
      >
        <Icon size={16} strokeWidth={2} />
      </span>
    );
    if (!label) {
      return (
        <button
          type="button"
          onClick={cycle}
          aria-label={`Aspect: ${LABELS[mode]}. Apasă pentru a schimba.`}
          title={`Aspect: ${LABELS[mode]}`}
          data-testid="theme-toggle-compact"
          className="press-feedback focus-ring-premium rounded-full"
        >
          {circle}
        </button>
      );
    }
    // With a label the whole row is the button, so tapping the text works too.
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`${label}: ${LABELS[mode]}. Apasă pentru a schimba.`}
        title={`${label}: ${LABELS[mode]}`}
        data-testid="theme-toggle-compact"
        className="fine-row press-feedback focus-ring-premium flex w-full items-center gap-2 rounded-full py-0.5 pl-0.5 pr-3 text-left"
      >
        {circle}
        <span className="flex-1 text-[12px]" style={{ color: theme.text3 }}>{label}</span>
        <span className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>{LABELS[mode]}</span>
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Aspect"
      data-testid="theme-toggle"
      className="inline-flex w-full max-w-md gap-0.5 rounded-[var(--r-md)] p-[3px]"
      style={{ background: 'var(--fill-subtle)', border: `0.5px solid ${theme.hairline}` }}
    >
      {THEME_MODES.map((option) => {
        const Icon = ICONS[option];
        const active = option === mode;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(option)}
            className="focus-ring-premium relative flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] px-3 py-2 text-[12.5px] font-semibold"
            style={{ color: active ? theme.text : theme.text3, transition: 'color var(--dur-fast) var(--ease-standard)' }}
          >
            {active && (
              <motion.span
                layoutId={`theme-pill-${pillId}`}
                className="absolute inset-0 rounded-[var(--r-sm)]"
                style={{
                  background: theme.surface,
                  boxShadow: 'var(--elev-1), var(--hairline-ring)',
                }}
                transition={calmMotion ? { duration: 0 } : spring.nav}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon size={14} strokeWidth={2} />
              {LABELS[option]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
