import { motion } from 'framer-motion';
import ProgressBar from '../../components/fx/ProgressBar';
import { Check, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Theme } from '../../theme/themes';
import { cardsLabel } from './cardsLabel';
import { dur, ease } from '../../theme/motion';

export function ReviewHeroCard({
  totalDue,
  totalFresh,
  totalCards,
  totalMastered,
  streak,
  theme,
}: {
  totalDue: number;
  totalFresh: number;
  totalCards: number;
  totalMastered: number;
  streak: number;
  theme: Theme;
}) {
  if (totalCards === 0) return null;
  const toStudy = totalDue + totalFresh;
  const masteryPct = Math.round((totalMastered / totalCards) * 100);
  const estimatedMinutes = Math.max(1, Math.ceil(toStudy * 0.5));
  const breakdown = [
    totalDue > 0 ? `${totalDue} ${totalDue === 1 ? 'restantă' : 'restante'}` : '',
    totalFresh > 0 ? `${totalFresh} ${totalFresh === 1 ? 'nou' : 'noi'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.standard }}
      aria-label="De repetat azi"
      className="rounded-[var(--r-md)] px-5 py-5"
      style={{ background: theme.surface, border: '1px solid var(--hairline)', boxShadow: 'var(--elev-1)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>
          De repetat azi
        </h2>
        {streak > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={{ background: `${theme.warning}14`, color: theme.text2 }}
          >
            <Flame size={13} style={{ color: theme.warning }} />
            {streak} {streak === 1 ? 'zi' : 'zile'} la rând
          </span>
        )}
      </div>

      {toStudy === 0 ? (
        <div className="mt-3 flex items-center gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
            style={{ background: `${theme.success}18`, color: theme.success }}
          >
            <Check size={20} />
          </div>
          <div>
            <div className="text-[17px] font-semibold" style={{ color: theme.text }}>
              La zi!
            </div>
            <div className="text-[13px]" style={{ color: theme.text3 }}>
              Nu ai nimic de repetat acum.
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div
              className="text-[28px] font-semibold leading-tight tracking-tight"
              style={{ color: theme.text }}
            >
              {cardsLabel(toStudy)}
            </div>
            <div className="mt-0.5 text-[13px]" style={{ color: theme.text3 }}>
              ~{estimatedMinutes} min{breakdown ? ` · ${breakdown}` : ''}
            </div>
          </div>
          <Link
            to="/flashcards/session/all"
            className="press-feedback w-full rounded-full px-6 py-2.5 text-center text-[14px] font-semibold text-white transition-[filter] duration-[var(--dur-base)] hover:brightness-110 sm:w-auto"
            style={{ background: theme.accent }}
          >
            Începe repetarea
          </Link>
        </div>
      )}

      <div className="mt-4">
        <ProgressBar
          percent={masteryPct}
          color={theme.success}
          delay={0.1}
          label="Cărți stăpânite"
          transition={{ duration: dur.slow, ease: ease.emphasized, delay: 0.1 }}
        />
        <div className="mt-1.5 text-[11.5px]" style={{ color: theme.text3 }}>
          {totalMastered} din {totalCards} stăpânite · {masteryPct}%
        </div>
      </div>
    </motion.section>
  );
}
