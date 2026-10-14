import { motion } from 'framer-motion';
import ProgressBar from '../../components/fx/ProgressBar';
import { HelpCircle, Dices, CheckCircle2, Pause } from 'lucide-react';
import type { Confidence } from '../../types';
import type { Theme } from '../../theme/themes';
import { dur, ease, press } from '../../theme/motion';

interface ConfidenceButtonsProps {
  onRate: (level: Confidence) => void;
  theme: Theme;
  calmMotion: boolean;
  /** Label changes on the last question so the user knows rating ends the session. */
  isLast: boolean;
  denseLayout?: boolean;
  /** Single slim row for the sticky dock: covers as little of the answer/explanation as possible. */
  compact?: boolean;
  /** When set, a countdown bar for this many ms is shown above the ratings and an
   *  inferred rating fires automatically once it runs out (see QuizPlay's handleAutoAdvance). */
  autoAdvanceMs?: number;
  /** Called when the user taps the countdown to cancel it and keep manual control. */
  onCancelAutoAdvance?: () => void;
}

const OPTIONS: Array<{
  level: Confidence;
  label: string;
  shortcut: string;
  icon: typeof HelpCircle;
  tone: (theme: Theme) => string;
}> = [
  { level: 'blackout', label: 'Nu știam', shortcut: '1', icon: HelpCircle, tone: (t) => t.danger },
  { level: 'guess', label: 'Ghiceam', shortcut: '2', icon: Dices, tone: (t) => t.warning },
  { level: 'confident', label: 'Știam sigur', shortcut: '3', icon: CheckCircle2, tone: (t) => t.success },
];

/**
 * Self-assessment row shown after the answer is revealed. Replaces the plain
 * "Next" button: picking a rating both stores the confidence and advances.
 */
export default function ConfidenceButtons({ onRate, theme, calmMotion, isLast, denseLayout, compact, autoAdvanceMs, onCancelAutoAdvance }: ConfidenceButtonsProps) {
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={calmMotion ? { duration: dur.instant } : { duration: dur.base, ease: ease.emphasized }}
        className="flex w-full items-center gap-3"
        role="group"
        aria-label="Cât de sigur ai fost?"
      >
        <p className="hidden shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] sm:block" style={{ color: theme.text3 }}>
          Cât de sigur ai fost?{isLast ? ' · final' : ''}
        </p>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          {OPTIONS.map((opt) => {
            const tone = opt.tone(theme);
            const Icon = opt.icon;
            return (
              <motion.button
                key={opt.level}
                type="button"
                onClick={() => onRate(opt.level)}
                aria-keyshortcuts={opt.shortcut}
                className="press-feedback focus-ring flex items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-[12px] font-bold"
                style={{ background: `${tone}12`, borderColor: `${tone}44`, color: tone }}
                whileTap={calmMotion ? undefined : press.whileTap}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="truncate">{opt.label}</span>
                <span className="hidden font-mono text-[9px] opacity-60 sm:inline" aria-hidden="true">{opt.shortcut}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={calmMotion ? { duration: dur.instant } : { duration: dur.base, ease: ease.emphasized }}
      className="w-full"
    >
      {!!autoAdvanceMs && (
        <motion.button
          key={autoAdvanceMs}
          onClick={onCancelAutoAdvance}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="press-feedback focus-ring mb-2.5 flex w-full items-center gap-2.5 rounded-[var(--r-md)] border px-3 py-2 text-left"
          style={{ background: theme.surface2, borderColor: theme.border }}
          title="Apasă pentru a opri avansarea automată"
        >
          <Pause size={12} style={{ color: theme.text3 }} />
          <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: theme.text3 }}>
            Următoarea întrebare automat...
          </span>
          <div className="w-16 flex-shrink-0">
            <ProgressBar percent={100} track={theme.border} color={theme.accent}
              transition={{ duration: autoAdvanceMs / 1000, ease: 'linear' }} label="Avansare automată" />
          </div>
        </motion.button>
      )}

      <p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text3 }}>
        Cât de sigur ai fost? {isLast ? '· finalizează sesiunea' : ''}
      </p>
      <div className={`grid grid-cols-3 ${denseLayout ? 'gap-2' : 'gap-2.5'}`}>
        {OPTIONS.map((opt) => {
          const tone = opt.tone(theme);
          const Icon = opt.icon;
          return (
            <motion.button
              key={opt.level}
              onClick={() => onRate(opt.level)}
              className={`press-feedback focus-ring flex flex-col items-center justify-center gap-1.5 rounded-[var(--r-lg)] border-2 font-black ${denseLayout ? 'px-2 py-3' : 'px-3 py-4'}`}
              style={{ background: `${tone}12`, borderColor: `${tone}55`, color: tone }}
              whileHover={calmMotion ? undefined : { background: `${tone}1f` }}
              whileTap={calmMotion ? undefined : press.whileTap}
            >
              <Icon size={denseLayout ? 16 : 18} />
              <span className={denseLayout ? 'text-[12px]' : 'text-sm'}>{opt.label}</span>
              <span className="text-[9px] font-mono opacity-60">tasta {opt.shortcut}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
