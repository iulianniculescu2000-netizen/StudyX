import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, spring } from '../../theme/motion';
import IconChip from './IconChip';

/**
 * Nav row — active state is a soft accent-tinted background, not a solid
 * gradient fill, so it doesn't fight the per-item hue on the icon chip next
 * to it (the chip itself carries the "you are here" signal via its glow).
 */
export default function NavItem({
  to, icon, label, badge, end, collapsed, hue,
}: {
  to: string; icon: React.ReactNode; label: string; badge?: React.ReactNode;
  end?: boolean; collapsed: boolean; hue?: string;
}) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  // The sliding pill owns the active tint, so the CSS tint/glow of .fine-row is cancelled while active
  // (via data-[active] classes on the row; hover on inactive rows keeps working). Calm motion: the pill still swaps, but instantly.
  const indicatorTransition = calmMotion ? { duration: dur.instant } : spring.nav;
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={collapsed ? (typeof badge === 'number' || (typeof badge === 'string' && badge.trim()) ? `${label}, ${badge}` : label) : undefined}
      className={`group relative isolate flex items-center rounded-[var(--r-md)] focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] ${
        collapsed ? 'mx-auto h-11 w-11 max-w-full justify-center' : 'w-full justify-start gap-[9px] px-2 py-1'
      } ${calmMotion ? '' : 'transition-transform duration-150 active:scale-[0.97]'}`}
      style={({ isActive }) => ({
        textDecoration: 'none',
        boxSizing: 'border-box',
        border: `1px solid ${isActive ? 'var(--accent-glow)' : 'transparent'}`,
        color: isActive ? theme.text : collapsed ? theme.text3 : theme.text2,
        fontSize: collapsed ? undefined : 13,
        fontWeight: collapsed ? undefined : isActive ? 650 : 500,
        cursor: 'pointer',
      })}
    >
      {({ isActive }) => (
        <>
          {/* Own hover layer: fades in/out on inactive rows and drops cleanly when active so it never fights the pill. */}
          {!isActive && (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 ${calmMotion ? '' : 'transition-opacity duration-150'}`}
              style={{ zIndex: -2, borderRadius: 13, background: 'var(--hover-fill)' }}
            />
          )}
          {isActive && (
            <>
              {/* Sliding pill: numeric borderRadius so framer corrects it during the layout animation (a CSS var can't be, which squashed it). */}
              <motion.span
                layoutId="nav-active-pill"
                aria-hidden="true"
                transition={indicatorTransition}
                className="pointer-events-none absolute inset-0"
                // Placa de sticlă a paginii active: lumină fină sus, ca butoanele și cardurile cu adâncime.
                style={{ zIndex: -1, borderRadius: 13, background: 'var(--accent-soft)', boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--glow-1)' }}
              />
              {/* Bar: same spring as the pill; vertical centering by margin, not a CSS transform that framer would overwrite. */}
              <motion.span
                layoutId="nav-active-bar"
                aria-hidden="true"
                transition={indicatorTransition}
                className="pointer-events-none absolute rounded-full"
                style={{ left: collapsed ? 1 : 0, top: '50%', marginTop: -8, width: 3, height: 16, borderRadius: 2, background: theme.accent }}
              />
            </>
          )}
          <IconChip icon={icon} hue={hue} active={isActive} size={collapsed ? 30 : 24} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate" style={{ transition: 'font-weight var(--dur-base) var(--ease-emphasized)' }}>{label}</span>
              {badge && (
                <motion.span
                  key={isActive ? 'on' : 'off'}
                  initial={calmMotion ? false : { scale: 0.85, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={t.pop}
                  className="flex shrink-0 items-center"
                >
                  {badge}
                </motion.span>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}
