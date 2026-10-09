import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { tallyByGroup } from '../../lib/flashcardDueQueue';
import type { Theme } from '../../theme/themes';
import type { CardItem, Rating } from './sessionTypes';

type Motion = ReturnType<typeof useAdaptiveMotion>['t'];

interface SessionSummaryProps {
  theme: Theme; calmMotion: boolean; t: Motion; isDue: boolean; cards: CardItem[]; ratings: Rating[];
  elapsed: number; mobile: boolean; remainingDue: number; handleContinue: () => void; goBack: () => void;
}

/** Ecranul de după ultimul card: scorul sesiunii, tabelul pe capitole și „Continuă”. */
export function SessionSummary({ theme, calmMotion, t, isDue, cards, ratings, elapsed, mobile, remainingDue, handleContinue, goBack }: SessionSummaryProps) {
  const hardCount = ratings.filter((rating) => rating === 'hard').length;
  const goodCount = ratings.filter((rating) => rating === 'good').length;
  const easyCount = ratings.filter((rating) => rating === 'easy').length;

  return (
    <div className="h-full flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: calmMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t.page}
        className="max-w-md w-full text-center"
      >
        <div
          className="w-20 h-20 rounded-[var(--r-xl)] mx-auto mb-6 flex items-center justify-center"
          style={{ background: theme.accent, boxShadow: 'var(--elev-2)' }}
        >
          <Trophy size={36} className="text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-tight mb-2" style={{ color: theme.text }}>Sesiune încheiată</h2>
        <p className={`text-sm font-medium opacity-60 ${isDue ? 'mb-6' : 'mb-10'}`} style={{ color: theme.text }}>
          Ai parcurs {cards.length} flashcarduri în {Math.floor(elapsed / 60)}m {elapsed % 60}s.
        </p>
        {isDue && (
          <ul data-testid="chapter-tally" className="mb-6 space-y-1.5 text-left">
            {tallyByGroup(cards, ratings).map((row) => (
              <li
                key={row.groupKey}
                className="flex items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2 text-[13px]"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{row.label}</span>
                <span className="flex-shrink-0 tabular-nums" style={{ color: theme.text3 }}>
                  {row.cards} {row.cards === 1 ? 'card' : 'carduri'}
                  {row.hard > 0 && <span style={{ color: theme.danger }}> · {row.hard} {row.hard === 1 ? 'dificil' : 'dificile'}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={`grid gap-3 mb-10 ${mobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
          <div className="p-4 rounded-[var(--r-lg)]" style={{ background: `${theme.danger}10`, border: `1px solid ${theme.danger}20` }}>
            <div className="text-xl font-black mb-1" style={{ color: theme.danger }}>{hardCount}</div>
            <div className="text-[10px] font-black uppercase opacity-50" style={{ color: theme.text }}>Dificile</div>
          </div>
          <div className="p-4 rounded-[var(--r-lg)]" style={{ background: `${theme.accent}10`, border: `1px solid ${theme.accent}20` }}>
            <div className="text-xl font-black mb-1" style={{ color: theme.accentText }}>{goodCount}</div>
            <div className="text-[10px] font-black uppercase opacity-50" style={{ color: theme.text }}>Bune</div>
          </div>
          <div className="p-4 rounded-[var(--r-lg)]" style={{ background: `${theme.success}10`, border: `1px solid ${theme.success}20` }}>
            <div className="text-xl font-black mb-1" style={{ color: theme.success }}>{easyCount}</div>
            <div className="text-[10px] font-black uppercase opacity-50" style={{ color: theme.text }}>Ușoare</div>
          </div>
        </div>

        {isDue && remainingDue > 0 && (
          <button
            onClick={handleContinue}
            className={`press-feedback mb-3 w-full rounded-[var(--r-lg)] font-black uppercase tracking-widest text-xs text-white ${mobile ? 'py-3.5' : 'py-4'}`}
            style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}
          >
            Continuă · încă {remainingDue} de repetat
          </button>
        )}
        <button
          onClick={goBack}
          className={`press-feedback w-full rounded-[var(--r-lg)] font-black uppercase tracking-widest text-xs ${isDue && remainingDue > 0 ? '' : 'text-white'} ${mobile ? 'py-3.5' : 'py-4'}`}
          style={isDue && remainingDue > 0
            ? { background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }
            : { background: theme.accent, boxShadow: 'var(--elev-1)' }}
        >
          Înapoi la Flashcards
        </button>
      </motion.div>
    </div>
  );
}
