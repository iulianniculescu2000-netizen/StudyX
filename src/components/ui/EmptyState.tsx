import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { spring } from '../../theme/motion';

export type EmptyStateAction = { label: string } & ({ to: string; onClick?: never } | { onClick: () => void; to?: never });

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
  /** Work in progress (e.g. the first document being read): the icon spins and the block is announced politely. */
  busy?: boolean;
}

/** Starea „nimic aici încă”: pictogramă, titlu, explicație și cel mult două acțiuni (link sau buton). */
export default function EmptyState({ icon: Icon, title, body, primary, secondary, busy = false }: EmptyStateProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  const renderAction = (action: EmptyStateAction, kind: 'primary' | 'secondary') => {
    const className = kind === 'primary'
      ? 'press-feedback rounded-full px-5 py-2.5 text-[13px] font-semibold text-white'
      : 'press-feedback glass-panel rounded-full px-5 py-2.5 text-[13px] font-semibold';
    const style = kind === 'primary' ? { background: theme.accent } : { color: theme.accentText };
    if (action.to !== undefined) {
      return <Link to={action.to} className={className} style={style}>{action.label}</Link>;
    }
    return <button type="button" onClick={action.onClick} className={className} style={style}>{action.label}</button>;
  };

  const rise = (delay: number) => (calmMotion
    ? { initial: false as const }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...spring.panel, delay } });

  return (
    <div
      className={`glass-panel relative overflow-hidden rounded-[var(--r-lg)] px-6 py-14 text-center sm:py-16 ${calmMotion ? '' : 'fx-rise'}`}
      {...(busy ? { role: 'status', 'aria-live': 'polite' as const } : {})}
    >
      {/* Halou fin în culoarea temei, în spatele ilustrației */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-6 h-56 w-80 -translate-x-1/2 rounded-full"
        style={{ background: `radial-gradient(closest-side, ${theme.accent}22, transparent)` }}
      />
      <motion.div className="relative mx-auto mb-6 h-[88px] w-[112px]" aria-hidden="true" {...(calmMotion ? { initial: false as const } : { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1 }, transition: spring.panel })}>
        <div
          className="absolute left-0 top-3 h-14 w-14 rounded-[var(--r-md)]"
          style={{ background: `${theme.accent}10`, outline: `1px solid ${theme.accent}22`, transform: 'rotate(-12deg)' }}
        />
        <div
          className="absolute right-0 top-3 h-14 w-14 rounded-[var(--r-md)]"
          style={{ background: `${theme.accent2}12`, outline: `1px solid ${theme.accent2}26`, transform: 'rotate(12deg)' }}
        />
        <div
          className="absolute left-1/2 top-0 flex h-[72px] w-[72px] -translate-x-1/2 items-center justify-center rounded-[var(--r-lg)]"
          style={{
            background: `linear-gradient(145deg, ${theme.accent}30, ${theme.accent}12)`,
            outline: `1px solid ${theme.accent}33`,
            color: theme.accentText,
            boxShadow: 'var(--elev-2)',
          }}
        >
          <Icon size={30} strokeWidth={1.6} className={busy ? 'animate-spin' : undefined} />
        </div>
        <span className="absolute -left-3 top-1 h-1.5 w-1.5 rounded-full" style={{ background: `${theme.accent}55` }} />
        <span className="absolute -right-2 bottom-3 h-2 w-2 rounded-full" style={{ background: `${theme.accent2}55` }} />
        <span className="absolute bottom-0 left-4 h-1 w-1 rounded-full" style={{ background: `${theme.accent}40` }} />
      </motion.div>
      <motion.h2 {...rise(0.05)} className="relative text-[18px] font-semibold tracking-tight" style={{ color: theme.text }}>{title}</motion.h2>
      {body && <motion.p {...rise(0.1)} className="relative mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed" style={{ color: theme.text3 }}>{body}</motion.p>}
      {(primary || secondary) && (
        <motion.div {...rise(0.15)} className="relative mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {primary && renderAction(primary, 'primary')}
          {secondary && renderAction(secondary, 'secondary')}
        </motion.div>
      )}
    </div>
  );
}
