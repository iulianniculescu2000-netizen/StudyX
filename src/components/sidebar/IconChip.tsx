import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { motion } from 'framer-motion';

/**
 * IconChip \u2014 the reusable pictogram unit for nav items: a small glass slot,
 * tinted per category from the app's own folder-color palette (`FOLDER_COLORS`)
 * instead of a new color system. Nudged off-axis at rest, settles upright and
 * pops slightly on hover; active items get a soft hue-tinted glow instead of a
 * solid fill, so the accent doesn't fight the per-item color underneath.
 * Items with no `hue` (e.g. Settings) render as a neutral, un-tilted slot \u2014
 * content is colorful, tools stay quiet.
 */
export default function IconChip({
  icon, hue, active, size,
}: {
  icon: React.ReactNode; hue?: string; active: boolean; size: number;
}) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();

  const colorStyle: React.CSSProperties = hue ? {
    background: active
      ? `color-mix(in srgb, ${hue} 30%, var(--fill-subtle))`
      : `color-mix(in srgb, ${hue} 14%, var(--fill-subtle))`,
    border: `1px solid color-mix(in srgb, ${hue} ${active ? 55 : 24}%, transparent)`,
    color: active ? hue : `color-mix(in srgb, ${hue} 68%, ${theme.text2})`,
    boxShadow: active
      ? 'inset 0 1px 0 var(--glass-highlight), var(--elev-1)'
      : 'inset 0 1px 0 var(--glass-highlight)',
  } : {
    background: active ? theme.surface2 : 'transparent',
    border: `1px solid ${active ? theme.border2 : 'transparent'}`,
    color: active ? theme.text : theme.text3,
  };

  const chip = (
    <motion.span
      initial={calmMotion ? false : { scale: 0.8, opacity: 0 }}
      animate={{ scale: active && !calmMotion ? [1, 1.14, 1] : 1, opacity: 1, rotate: 0 }}
      transition={t.modal}
      className="flex items-center justify-center"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 'var(--r-sm)', ...colorStyle }}
    >
      {/* The glyph lifts a hair when the row (the `group`) is hovered; static when motion is calm. */}
      <span
        className={`flex items-center justify-center ${calmMotion ? '' : 'transition-transform duration-[var(--dur-fast)] ease-[var(--ease-standard)] group-hover:-translate-y-px group-hover:scale-110'}`}
      >
        {icon}
      </span>
    </motion.span>
  );
  if (!hue || !active) return chip;
  // Iconița paginii active stă pe o a doua placă de sticlă, ușor în spate (aceeași idee ca în tururi și Rezidențiat).
  return (
    <span className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ borderRadius: 'var(--r-sm)', background: `color-mix(in srgb, ${hue} 22%, transparent)`, transform: 'translate(3px, -3px)' }}
      />
      <span className="relative flex">{chip}</span>
    </span>
  );
}
