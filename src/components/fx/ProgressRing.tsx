import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';

/** Round progress with a rounded end that eases to its value; `value` is 0–100 (NaN and out-of-range values are safe). */
export default function ProgressRing({ value, size = 56, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const box = Number.isFinite(size) && size > 0 ? size : 56;
  const width = Math.min(Number.isFinite(stroke) && stroke > 0 ? stroke : 6, box / 2);
  const radius = Math.max(0.5, (box - width) / 2);
  const circumference = 2 * Math.PI * radius;
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label ?? `${Math.round(clamped)}%`} className="flex-shrink-0">
      <circle cx={box / 2} cy={box / 2} r={radius} fill="none" stroke="var(--fill-subtle)" strokeWidth={width} />
      <circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        fill="none"
        stroke={theme.accent}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform={`rotate(-90 ${box / 2} ${box / 2})`}
        style={{ transition: calmMotion ? 'none' : 'stroke-dashoffset calc(var(--dur-slow) * 1.4) var(--ease-standard)' }}
      />
    </svg>
  );
}
