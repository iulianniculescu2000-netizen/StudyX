import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import type { Confidence } from '../../../types';
import type { Theme } from '../../../theme/themes';
import { press } from '../../../theme/motion';
import type { QuizPlayLayout } from '../layout';
import ConfidenceButtons from '../ConfidenceButtons';

/** Label of the primary "check my answer" button, shared by the inline bar and the dock. */
function confirmLabel(examMode: boolean, isMultiple: boolean, selectedCount: number) {
  return examMode
    ? `Confirmă (${selectedCount})`
    : isMultiple
      ? `Verifică selecția (${selectedCount})`
      : 'Verifică răspunsul';
}

interface InlineConfirmProps {
  theme: Theme;
  calmMotion: boolean;
  examMode: boolean;
  isMultiple: boolean;
  selectedCount: number;
  onConfirm: () => void;
}

/** In-flow confirm bar (wide screens). The dock below replaces it on compact viewports. */
export function InlineConfirm({ theme, calmMotion, examMode, isMultiple, selectedCount, onConfirm }: InlineConfirmProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mb-4 flex flex-wrap items-center gap-3"
    >
      <motion.button
        onClick={onConfirm}
        disabled={selectedCount === 0}
        className="press-feedback focus-ring flex-1 rounded-[var(--r-lg)] px-5 py-3.5 text-sm font-black text-white disabled:opacity-35 sm:flex-none sm:min-w-[220px]"
        style={{ background: theme.accent, boxShadow: 'var(--elev-2)' }}
        whileTap={calmMotion ? undefined : press.whileTap}
      >
        {confirmLabel(examMode, isMultiple, selectedCount)}
      </motion.button>

      {!examMode && (
        <div className="rounded-[var(--r-lg)] border px-4 py-3 text-xs font-bold" style={{ background: theme.surface2, borderColor: theme.border, color: theme.text3 }}>
          {selectedCount > 0
            ? `${selectedCount} variant${selectedCount === 1 ? 'ă selectată' : 'e selectate'}`
            : 'Selectează un răspuns pentru a continua'}
        </div>
      )}
    </motion.div>
  );
}

interface ActionDockProps {
  theme: Theme;
  layout: QuizPlayLayout;
  mobile: boolean;
  calmMotion: boolean;
  examMode: boolean;
  timedMode: boolean;
  revealed: boolean;
  isLast: boolean;
  isMultiple: boolean;
  selectedCount: number;
  answerStreak: number;
  questionTimer: number;
  timerTone: string;
  currentIdx: number;
  total: number;
  onRate: (level: Confidence) => void;
  onNext: () => void;
  onConfirm: () => void;
}

/** Sticky bottom bar for compact/mobile viewports: rating buttons after reveal, otherwise status + confirm. */
export function ActionDock({
  theme, layout, mobile, calmMotion, examMode, timedMode, revealed, isLast, isMultiple, selectedCount, answerStreak,
  questionTimer, timerTone, currentIdx, total, onRate, onNext, onConfirm,
}: ActionDockProps) {
  const selectionSummary = selectedCount > 0
    ? `${selectedCount} variant${selectedCount === 1 ? 'ă selectată' : 'e selectate'}`
    : examMode
      ? 'Selectează și confirmă'
      : 'Selectează un răspuns pentru a continua';
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="sticky bottom-3 z-20 mt-4"
    >
      <div className={`glass-panel rounded-[var(--r-lg)] border ${layout.denseLayout ? 'px-3 py-3' : 'px-4 py-4'}`}>
        {mobile && !examMode && answerStreak > 1 && (
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.1em]" style={{ color: theme.warning }}>
            <Flame size={13} fill={theme.warning} />
            {answerStreak} corecte la rând
          </div>
        )}
        {revealed && !examMode ? (
          <ConfidenceButtons
            onRate={onRate}
            theme={theme}
            calmMotion={calmMotion}
            isLast={isLast}
            denseLayout={layout.denseLayout}
          />
        ) : (
          <div className={`flex items-start justify-between gap-3 ${mobile ? 'flex-col' : ''}`}>
            <div className="min-w-0">
              <p className={`font-semibold leading-relaxed ${layout.denseLayout ? 'text-[13px] sm:text-sm' : 'text-sm'}`} style={{ color: theme.text }}>
                {selectionSummary}
              </p>
            </div>

            <div className={`flex items-center gap-2 ${mobile ? 'w-full flex-col' : 'shrink-0'}`}>
              {!revealed && (
                <div
                  className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${mobile ? 'w-full text-center' : ''}`}
                  style={{ background: theme.surface2, borderColor: theme.border, color: timedMode ? timerTone : theme.text3 }}
                >
                  {timedMode ? `Timer ${questionTimer}s` : `Întrebarea ${currentIdx + 1}/${total}`}
                </div>
              )}

              <motion.button
                onClick={revealed ? onNext : onConfirm}
                disabled={!revealed && selectedCount === 0}
                className={`press-feedback rounded-[var(--r-lg)] text-sm font-black text-white disabled:opacity-35 ${layout.denseLayout ? 'px-4 py-2.5' : 'px-5 py-3'} ${mobile ? 'w-full' : 'min-w-[220px]'}`}
                style={{ background: theme.accent, boxShadow: 'var(--elev-2)' }}
                whileTap={calmMotion ? undefined : press.whileTap}
              >
                {revealed ? (isLast ? 'Vezi rezultatele' : 'Următor') : confirmLabel(examMode, isMultiple, selectedCount)}
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
