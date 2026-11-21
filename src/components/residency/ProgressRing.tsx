import { useTheme } from '../../theme/ThemeContext';

const SIZE = 46;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Inel de progres mic, cu procentul în mijloc. Arcul se umple lin când procentul se schimbă (tranziție CSS pe
 * `stroke-dashoffset`, oprită de mișcarea redusă prin regula globală). Procentul se rotunjește și se limitează la 0–100.
 */
export default function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const theme = useTheme();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div role="img" aria-label={label} className="relative h-[46px] w-[46px] flex-shrink-0">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--fill-subtle)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={theme.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - value / 100)}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-standard)', opacity: value === 0 ? 0 : 1 }}
        />
      </svg>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums"
        style={{ color: theme.accentText }}
      >
        {value}%
      </span>
    </div>
  );
}
