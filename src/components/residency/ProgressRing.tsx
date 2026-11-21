import { useTheme } from '../../theme/ThemeContext';

/** Inel de progres mic, cu procentul în mijloc. Procentul se rotunjește și se limitează la 0–100. */
export default function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const theme = useTheme();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${theme.accent} ${value * 3.6}deg, var(--fill-subtle) 0)` }}
    >
      <div
        className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
        style={{ background: theme.surface, color: theme.accentText }}
        aria-hidden
      >
        {value}%
      </div>
    </div>
  );
}
