import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, ease } from '../../theme/motion';
import { selectRelevantTips, type AppTipContext } from '../../data/appTips';

const ROTATION_MS = 16000;
const DISMISS_KEY = 'studyx:tips:dismissed-on';

/**
 * A single "știai că…" line under the hero, rotating slowly.
 *
 * Deliberately a strip and not a card: the dashboard already has a hero, an AI
 * buddy and four stat tiles, and another box would break that rhythm. One line
 * of frosted glass reads as a caption to the hero rather than a fifth block
 * competing for attention.
 *
 * Dismissing hides it for the rest of the day — long enough not to nag, short
 * enough that new features still get discovered.
 */
export default function DashboardTipStrip({ context }: { context: AppTipContext }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { calmMotion } = useAdaptiveMotion();

  const today = new Date().toISOString().slice(0, 10);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === today;
    } catch {
      return false;
    }
  });

  const tips = useMemo(() => selectRelevantTips(context), [context]);
  // Start somewhere different each day so the same tip isn't always first.
  const [index, setIndex] = useState(() => {
    const day = Math.floor(Date.now() / 86400000);
    return tips.length > 0 ? day % tips.length : 0;
  });

  useEffect(() => {
    if (dismissed || tips.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % tips.length);
    }, calmMotion ? ROTATION_MS * 1.75 : ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [dismissed, tips.length, calmMotion]);

  if (dismissed || tips.length === 0) return null;

  const tip = tips[index % tips.length];

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, today);
    } catch { /* storage full or blocked — hiding for this session is enough */ }
  };

  return (
    <div
      className="glass-panel mb-6 flex items-start gap-3 overflow-hidden rounded-[var(--r-lg)] px-4 py-3"
      style={{ borderColor: `${theme.accent}22` }}
    >
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[13px]"
        style={{ background: `${theme.accent}14`, border: `1px solid ${theme.accent}22` }}
      >
        {tip.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={tip.id}
            initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={calmMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: calmMotion ? dur.instant : dur.base, ease: ease.standard }}
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
          >
            <span className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: theme.accentText }}>
              Știai că
            </span>
            <span className="min-w-[12rem] flex-1 text-[13px] font-semibold leading-snug" style={{ color: theme.text2 }}>
              {tip.text}
            </span>
            {tip.action && (
              <button
                onClick={() => navigate(tip.action!.route)}
                className="press-feedback inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black focus-ring"
                style={{ background: `${theme.accent}14`, color: theme.accentText }}
              >
                {tip.action.label}
                <ArrowRight size={11} />
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 pt-0.5">
        {tips.length > 1 && (
          <div className="hidden items-center gap-1 lg:flex" aria-hidden>
            {tips.slice(0, 6).map((entry, dotIndex) => (
              <span
                key={entry.id}
                className="h-1 rounded-full"
                style={{
                  width: 4,
                  transform: dotIndex === index % Math.min(tips.length, 6) ? 'scaleX(2.4)' : undefined,
                  background: dotIndex === index % Math.min(tips.length, 6) ? theme.accent : theme.border,
                  transition: calmMotion ? 'none' : 'transform var(--dur-base) var(--ease-emphasized), background-color var(--dur-base) var(--ease-standard)',
                }}
              />
            ))}
          </div>
        )}
        <button
          onClick={dismiss}
          aria-label="Ascunde sfaturile pentru azi"
          title="Ascunde pentru azi"
          className="fine-row press-feedback p-1.5 hover:!text-[var(--text)]"
          style={{ color: theme.text3 }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
