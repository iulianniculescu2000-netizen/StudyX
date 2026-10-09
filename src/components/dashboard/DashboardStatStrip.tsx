import { memo } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import GlassCard from '../ui/GlassCard';
import { dur, ease, staggerStep } from '../../theme/motion';

export type DashboardStat = {
  label: string;
  numeric: number;
  display?: string;
  suffix: string;
  color: string;
  delta?: number | null;
  deltaUnit?: '%' | 'pp';
};

/**
 * Thin strip of stats under the hero (UI 2.0) — replaces the four
 * competing 28px-radius cards from UI 1.0. Same numbers, same real
 * week-over-week deltas, just not fighting the hero for attention.
 */
const DIVIDER = '0.5px solid color-mix(in srgb, var(--hairline) 60%, transparent)';

const DashboardStatStrip = memo(function DashboardStatStrip({ stats }: { stats: DashboardStat[] }) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  return (
    <GlassCard
      animate
      padding="0"
      radius="var(--r-lg)"
      className="fx-spot mb-8 grid grid-cols-2 md:grid-cols-4"
      style={{ borderColor: theme.border }}
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={calmMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={calmMotion ? { duration: dur.instant } : { delay: Math.min(index, 8) * staggerStep, duration: dur.base, ease: ease.emphasized }}
          className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[var(--hover-fill)]"
          style={{
            borderLeft: index % 2 === 1 ? DIVIDER : undefined,
            borderTop: index >= 2 ? DIVIDER : undefined,
          }}
        >
          <div>
            <div className="secondary-label mb-1 font-black tracking-widest" style={{ color: theme.text3 }}>{stat.label}</div>
            <div className="text-2xl font-black tracking-tighter tabular-nums" style={{ color: theme.text }}>
              {stat.display ?? `${stat.numeric}${stat.suffix}`}
            </div>
          </div>
          {typeof stat.delta === 'number' && stat.delta !== 0 && (
            <div
              className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${calmMotion ? '' : 'badge-in'}`}
              style={{
                color: stat.delta > 0 ? theme.success : theme.danger,
                background: `color-mix(in srgb, ${stat.delta > 0 ? theme.success : theme.danger} 15%, transparent)`,
              }}
              title="Față de săptămâna trecută"
            >
              {stat.delta > 0 ? '▲' : '▼'} {Math.abs(stat.delta)}{stat.deltaUnit === 'pp' ? ' pp' : '%'}
            </div>
          )}
        </motion.div>
      ))}
    </GlassCard>
  );
});

export default DashboardStatStrip;
