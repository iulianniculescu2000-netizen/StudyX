import { forwardRef, type CSSProperties } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { heroIn } from '../../theme/motion';

export type GlassCardVariant = 'default' | 'strong' | 'hero';

export interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  /** `default` = ordinary panel, `strong` = modal/elevated surface, `hero` = the one-per-screen highlight card. */
  variant?: GlassCardVariant;
  padding?: string;
  radius?: string;
  /** Play the entrance animation (skipped automatically under reduced-motion / lite performance). */
  animate?: boolean;
}

/**
 * The single glass-panel primitive every screen should build cards from,
 * instead of each one hand-rolling `className="glass-panel rounded-[...]"`
 * inline. Reads the same `--glass-panel`/`--glass-border`/`--shadow-color`
 * CSS variables `.glass-panel` in index.css already uses (ThemeContext sets
 * them per theme, so this reskins automatically with the active theme —
 * including per-theme tinted glass via `Theme.glassPanel`, see themes.ts).
 */
const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { variant = 'default', padding = '20px', radius = '24px', animate = false, style, className, children, ...rest },
  ref,
) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  // backdrop-filter/box-shadow come from the `.glass-panel` CLASS on purpose,
  // not inline styles: index.css degrades those specifically for `.glass-panel`
  // under data-performance="lite"/data-power-save (some of it via !important).
  // An inline style would win over the non-!important "lite" rule and silently
  // defeat that degradation for every card built on this primitive.
  const background = variant === 'strong'
    ? 'var(--glass-panel-strong)'
    : variant === 'hero'
      ? 'linear-gradient(150deg, var(--glass-panel-strong), var(--glass-panel))'
      : undefined; // 'default' takes .glass-panel's own background as-is

  // `style` on HTMLMotionProps allows MotionValue for animatable fields, which
  // CSSProperties doesn't — in practice no caller passes one here, so this is
  // a safe narrowing cast, not a real type hole.
  const baseStyle: CSSProperties = {
    position: 'relative',
    borderRadius: radius,
    padding,
    ...(background ? { background } : {}),
    color: theme.text,
    ...(style as CSSProperties),
  };

  return (
    <motion.div
      ref={ref}
      className={['glass-panel', className].filter(Boolean).join(' ')}
      style={baseStyle}
      initial={animate && !calmMotion ? 'hidden' : false}
      animate="visible"
      variants={heroIn}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

export default GlassCard;
