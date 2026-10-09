import { useId, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import type { Status } from '../../lib/organizare/types';

/** Small uppercase label above a block, the same one the Rezidențiat page uses. */
export { default as Label } from '../ui/SectionLabel';

/** A glass card. `lift` raises it on hover, `spot` makes it catch the cursor light, `index` staggers its entrance. */
export function Card({
  children,
  className = '',
  style,
  lift = false,
  spot = true,
  index,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  lift?: boolean;
  spot?: boolean;
  index?: number;
  padded?: boolean;
}) {
  const classes = ['glass-panel', 'rounded-2xl', padded ? 'p-4 sm:p-5' : '', lift ? 'fx-lift' : '', spot ? 'fx-spot' : '', index !== undefined ? 'fx-rise' : '', className]
    .filter(Boolean)
    .join(' ');
  return <div className={classes} style={index !== undefined ? ({ '--i': index, ...style } as CSSProperties) : style}>{children}</div>;
}

/** Content that slides open and shut (the row of a CSS grid animates between 0 and its natural height). */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const { calmMotion } = useAdaptiveMotion();
  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: calmMotion ? 'none' : 'grid-template-rows var(--dur-slow) var(--ease-standard), opacity var(--dur-base) ease',
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  const theme = useTheme();
  return (
    <ChevronRight
      size={16}
      style={{ color: theme.text3, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}
    />
  );
}

/** A thin bar whose fill slides to its value (a transform, not the width); `value` is 0–100. */
export function Bar({ value, color, height = 5 }: { value: number; color?: string; height?: number }) {
  const theme = useTheme();
  return (
    <div className="overflow-hidden rounded-full" style={{ height, background: 'var(--fill-subtle)' }}>
      <div
        className="h-full w-full rounded-full"
        style={{ transform: `translateX(${Math.max(0, Math.min(100, value)) - 100}%)`, background: color ?? theme.accent, transition: 'transform calc(var(--dur-slow) * 1.4) var(--ease-standard)' }}
      />
    </div>
  );
}

const STATUS_LABEL = ['De făcut', 'În curs', 'Gata'];

/**
 * The round control in front of a topic. One tap moves it on: empty → half (in progress) → ticked (done).
 * Finishing pops the tick in and reports where it was tapped so the page can celebrate from there.
 */
export function StatusCheck({
  status,
  color,
  label,
  onCycle,
  size = 26,
}: {
  status: Status;
  color?: string;
  label: string;
  onCycle: (origin: { x: number; y: number }) => void;
  size?: number;
}) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const id = useId();
  const done = status === 2;
  const tone = done ? theme.success : theme.warning;
  const rail = color ?? 'var(--hairline)';
  return (
    <motion.button
      type="button"
      aria-label={`${label}: ${STATUS_LABEL[status]}. Apasă ca să schimbi starea.`}
      title={STATUS_LABEL[status]}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onCycle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
      whileTap={calmMotion ? undefined : { scale: 0.86 }}
      whileHover={calmMotion ? undefined : { scale: 1.08 }}
      className="relative flex flex-shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        border: `2px solid ${status === 0 ? rail : tone}`,
        background: done
          ? tone
          : status === 1
            ? `linear-gradient(90deg, ${tone} 50%, transparent 50%)`
            : 'transparent',
        transition: 'background var(--dur-fast) ease, border-color var(--dur-fast) ease',
      }}
    >
      <AnimatePresence initial={false}>
        {done && (
          <motion.span
            key={`${id}-tick`}
            initial={calmMotion ? false : { scale: 0.3, opacity: 0, rotate: -25 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            className="flex text-white"
          >
            <Check size={size * 0.5} strokeWidth={3.4} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** A quiet round button with an icon and a label for screen readers. */
export function GhostButton({
  children,
  onClick,
  label,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  label?: string;
  tone?: 'neutral' | 'accent';
  className?: string;
}) {
  const theme = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`press-feedback inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${className}`}
      style={tone === 'accent'
        ? { background: 'var(--accent-soft)', color: theme.accentText }
        : { background: theme.surface2, color: theme.text2 }}
    >
      {children}
    </button>
  );
}
