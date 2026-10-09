import { useId, type CSSProperties, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import Portal from '../Portal';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import ProgressBar from '../fx/ProgressBar';
import SectionLabel from '../ui/SectionLabel';
import { burstAt } from '../../lib/fxConfetti';
import { earnedLabel } from '../../lib/gamificationAchievements';
import { useTheme } from '../../theme/ThemeContext';
import type { Theme } from '../../theme/themes';
import {
  CATEGORY_LABELS,
  RARITY_LABELS,
  UNIT_LABELS,
  type Achievement,
  type Rarity,
} from './gamificationCatalog';

interface AIGamificationAchievementsProps {
  achievements: Achievement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function rarityColor(theme: Theme, rarity: Rarity): string {
  switch (rarity) {
    case 'rare': return theme.accentText;
    case 'epic': return theme.accent2;
    case 'legendary': return theme.warning;
    default: return theme.text3;
  }
}

function AchievementDetail({ achievement, onClose }: { achievement: Achievement; onClose: () => void }) {
  const theme = useTheme();
  const { calmMotion, performanceLite, t } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(true, onClose);
  const titleId = useId();
  const color = rarityColor(theme, achievement.rarity);
  const Icon = achievement.icon;
  const unit = UNIT_LABELS[achievement.unit];

  return (
    <motion.div
      initial={calmMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={t.pop}
      className="fixed inset-0 z-[10005] flex items-center justify-center p-4"
      style={{ background: 'var(--overlay)', backdropFilter: performanceLite ? 'blur(2px)' : 'blur(var(--blur-2))' }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={calmMotion ? false : { opacity: 0, scale: 0.985, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.985, y: 8, transition: t.modalExit }}
        transition={t.modal}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-lg)] p-6"
        style={{ background: theme.modalBg, border: `1px solid ${theme.border2}`, boxShadow: 'var(--elev-4)' }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
            style={achievement.done ? { background: theme.accent, color: '#fff' } : { background: 'var(--fill-subtle)', color: theme.text2 }}
            aria-hidden="true"
          >
            {achievement.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[18px] font-semibold leading-snug" style={{ color: theme.text }}>
              {achievement.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="fine-chip rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color }}>
                {RARITY_LABELS[achievement.rarity]}
              </span>
              <span className="fine-chip rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: theme.text2 }}>
                {CATEGORY_LABELS[achievement.category]}
              </span>
              {achievement.done && (
                <span className="fine-chip rounded-full px-2 py-0.5 text-[11px] font-medium" data-active="true">
                  {achievement.earned ? earnedLabel(achievement.earned) : 'Câștigată acum'}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="fine-chip flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
            style={{ color: theme.text3 }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: theme.text2 }}>{achievement.description}</p>

        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]" style={{ color: theme.text3 }}>
            <span>Progres</span>
            <span className="font-medium tabular-nums" style={{ color: theme.text2 }}>
              {achievement.current}/{achievement.target} {unit}
            </span>
          </div>
          <ProgressBar percent={achievement.percent} color={achievement.done ? theme.success : theme.accent} heightClass="h-1.5" label={`Progres: ${achievement.title}`} />
        </div>

        <div className="mt-5">
          <SectionLabel className="!px-0">Cum se măsoară</SectionLabel>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: theme.text2 }}>{achievement.how}</p>
        </div>

        {achievement.hint && !achievement.done && (
          <p
            className="mt-4 rounded-[var(--r-sm)] px-3 py-2 text-[12.5px] leading-relaxed"
            style={{ background: 'var(--accent-soft)', color: theme.accentText }}
          >
            {achievement.hint}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function AIGamificationAchievements({
  achievements,
  selectedId,
  onSelect,
}: AIGamificationAchievementsProps) {
  const theme = useTheme();
  const selected = achievements.find((item) => item.id === selectedId) ?? null;

  const open = (event: MouseEvent<HTMLButtonElement>, achievement: Achievement) => {
    if (achievement.done) {
      // A keyboard "click" has no pointer position: burst from the middle of the card instead.
      const rect = event.currentTarget.getBoundingClientRect();
      const keyboard = event.detail === 0;
      burstAt(keyboard ? rect.left + rect.width / 2 : event.clientX, keyboard ? rect.top + rect.height / 2 : event.clientY);
    }
    onSelect(achievement.id);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {achievements.map((achievement, index) => {
          const Icon = achievement.icon;
          const color = rarityColor(theme, achievement.rarity);
          return (
            <button
              key={achievement.id}
              type="button"
              onClick={(event) => open(event, achievement)}
              aria-haspopup="dialog"
              className="glass-panel fx-lift fx-spot fx-rise block w-full rounded-2xl p-4 text-left"
              style={{ '--i': index } as CSSProperties}
            >
              <span className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
                  style={achievement.done ? { background: theme.accent, color: '#fff' } : { background: 'var(--fill-subtle)', color: theme.text2 }}
                  aria-hidden="true"
                >
                  {achievement.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </span>
                <span className="block min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug" style={{ color: theme.text }}>{achievement.title}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="fine-chip rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color }}>
                      {RARITY_LABELS[achievement.rarity]}
                    </span>
                    <span className="fine-chip rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: theme.text3 }}>
                      {CATEGORY_LABELS[achievement.category]}
                    </span>
                  </span>
                </span>
              </span>
              <span className="mt-3 block text-[12.5px] leading-relaxed" style={{ color: theme.text3 }}>{achievement.description}</span>
              {achievement.hint && !achievement.done && (
                <span className="mt-2 block text-[11.5px] leading-relaxed" style={{ color: theme.accentText }}>{achievement.hint}</span>
              )}
              <span className="mt-4 block">
                <ProgressBar percent={achievement.percent} color={achievement.done ? theme.success : theme.accent} delay={index * 0.04} label={`Progres: ${achievement.title}`} />
                <span className="mt-1.5 flex items-center justify-between text-[11.5px] tabular-nums" style={{ color: theme.text3 }}>
                  <span>{achievement.done ? (achievement.earned ? earnedLabel(achievement.earned) : 'Câștigată acum') : 'În curs'}</span>
                  <span className="font-medium" style={{ color: theme.text2 }}>
                    {achievement.current}/{achievement.target} {UNIT_LABELS[achievement.unit]}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Portal>
        <AnimatePresence>
          {selected && <AchievementDetail key={selected.id} achievement={selected} onClose={() => onSelect(null)} />}
        </AnimatePresence>
      </Portal>
    </>
  );
}
