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
      aria-label={collapsed ? label : undefined}
      className="rounded-[var(--r-md)] focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      {({ isActive }) => (
        <motion.div
          whileTap={calmMotion ? undefined : { scale: 0.97 }}
          whileHover={calmMotion || collapsed ? undefined : { x: 2 }}
          transition={t.tap}
          className="fine-row group relative isolate !bg-transparent data-[active=true]:!shadow-none flex items-center"
          data-active={isActive}
          style={collapsed ? {
            width: 44,
            height: 44,
            margin: '0 auto',
            justifyContent: 'center',
            border: `1px solid ${isActive ? 'var(--accent-glow)' : 'transparent'}`,
            color: isActive ? theme.text : theme.text3,
            cursor: 'pointer',
            borderRadius: 'var(--r-md)',
          } : {
            gap: 9,
            padding: '4px 8px',
            justifyContent: 'flex-start' as const,
            border: `1px solid ${isActive ? 'var(--accent-glow)' : 'transparent'}`,
            color: isActive ? theme.text : theme.text2,
            fontSize: 13,
            fontWeight: isActive ? 650 : 500,
            cursor: 'pointer',
            borderRadius: 'var(--r-md)',
          }}
        >
          {/* Own hover layer (the CSS row hover is cancelled): fades in/out, and drops instantly on the active row so it never fights the pill. */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 group-data-[active=true]:!opacity-0 group-data-[active=true]:!transition-none ${calmMotion ? '' : 'transition-opacity duration-150'}`}
            style={{ zIndex: -2, borderRadius: 14, background: 'var(--hover-fill)' }}
          />
          {isActive && (
            <>
              {/* Sliding pill: numeric borderRadius so framer corrects it during the layout animation (a CSS var can't be, which squashed it). */}
              <motion.span
                layoutId="nav-active-pill"
                aria-hidden="true"
                transition={indicatorTransition}
                className="pointer-events-none absolute inset-0"
                style={{ zIndex: -1, borderRadius: 14, background: 'var(--accent-soft)', boxShadow: 'var(--glow-1)' }}
              />
              {/* Bar: same spring as the pill; vertical centering by margin, not a CSS transform that framer would overwrite. */}
              <motion.span
                layoutId="nav-active-bar"
                aria-hidden="true"
                transition={indicatorTransition}
                className="pointer-events-none absolute left-0 rounded-full"
                style={{ top: '50%', marginTop: -8, width: 3, height: 16, borderRadius: 2, background: theme.accent }}
              />
            </>
          )}
          <IconChip icon={icon} hue={hue} active={isActive} size={collapsed ? 30 : 24} />
          {!collapsed && (
            <>
              <span className="flex-1 truncate" style={{ transition: 'font-weight var(--dur-base) var(--ease-emphasized)' }}>{label}</span>
              {badge && (
                <motion.span
                  key={isActive ? 'on' : 'off'}
                  initial={calmMotion ? false : { scale: 0.85, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={t.pop}
                  className="flex items-center"
                >
                  {badge}
                </motion.span>
              )}
            </>
          )}
        </motion.div>
      )}
    </NavLink>
  );
}
