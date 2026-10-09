import { motion, type Transition } from 'framer-motion';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, ease } from '../../theme/motion';

/**
 * Bară de progres subțire, 0–100. Umplutura are lățimea întreagă și alunecă din stânga cu `transform`
 * (nu animăm lățimea), așa că marginea ei rămâne rotunjită. `heightClass` = clasa Tailwind de înălțime.
 * `color` poate fi orice valoare CSS `background` (culoare sau gradient); `track` schimbă fundalul barei;
 * `transition` înlocuiește animația implicită (în modul calm rămâne instant).
 */
export default function ProgressBar({
  percent,
  color,
  delay = 0,
  heightClass = 'h-1',
  label,
  track = 'var(--fill-subtle)',
  transition,
  className = '',
}: {
  percent: number;
  color: string;
  delay?: number;
  heightClass?: 'h-1' | 'h-1.5' | 'h-2' | 'h-2.5';
  label: string;
  track?: string;
  transition?: Transition;
  className?: string;
}) {
  const { calmMotion } = useAdaptiveMotion();
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span
      className={`block w-full overflow-hidden rounded-full ${heightClass} ${className}`}
      style={{ background: track }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <motion.span
        className="block h-full w-full rounded-full"
        style={{ background: color }}
        initial={calmMotion ? false : { x: '-100%' }}
        animate={{ x: `${clamped - 100}%` }}
        transition={calmMotion ? { duration: 0 } : (transition ?? { duration: dur.slow * 1.4, ease: ease.standard, delay })}
      />
    </span>
  );
}
