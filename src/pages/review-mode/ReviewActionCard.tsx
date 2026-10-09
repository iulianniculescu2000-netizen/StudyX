import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import { pressLarge } from '../../theme/motion';

interface ReviewActionCardProps {
  accent: string;
  badge?: number | string;
  ctaLabel?: string;
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  subtitle: string;
  theme: Theme;
  title: string;
  wide?: boolean;
  onClick: () => void;
}

export default function ReviewActionCard({
  accent,
  badge,
  ctaLabel,
  description,
  disabled = false,
  icon: Icon,
  subtitle,
  theme,
  title,
  wide = false,
  onClick,
}: ReviewActionCardProps) {
  return (
    <motion.button
      {...(disabled ? {} : pressLarge)}
      onClick={onClick}
      disabled={disabled}
      className={`glass-panel fx-lift group relative flex min-h-[208px] w-full flex-col overflow-hidden rounded-[var(--r-xl)] p-6 text-left disabled:opacity-40 disabled:hover:transform-none ${wide ? 'md:col-span-2' : ''}`}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 h-28 w-28 rounded-full blur-3xl"
        style={{ background: `${accent}18` }}
      />

      <div
        className="pointer-events-none absolute inset-x-6 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
      />

      <div className="relative mb-5 flex items-start gap-4">
        <div
          className="flex h-13 w-13 shrink-0 items-center justify-center rounded-[var(--r-lg)]"
          style={{ background: `${accent}18`, border: `1px solid ${accent}38` }}
        >
          <Icon size={26} strokeWidth={1.75} style={{ color: accent }} />
        </div>

        <div className="min-w-0 flex-1">
          <span className="block text-lg font-black leading-tight" style={{ color: theme.text }}>
            {title}
          </span>
          <span
            className="fine-chip mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            {subtitle}
          </span>
        </div>

        {badge !== undefined && (
          <span
            data-active="true"
            className="fine-chip shrink-0 rounded-full px-3 py-1 text-xs font-black"
          >
            {badge}
          </span>
        )}
      </div>

      <p className="relative mt-auto text-sm font-medium leading-relaxed" style={{ color: theme.text2 }}>
        {description}
      </p>

      {ctaLabel && (
        <div className="relative mt-5 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: accent }}>
          {ctaLabel}
        </div>
      )}
    </motion.button>
  );
}
