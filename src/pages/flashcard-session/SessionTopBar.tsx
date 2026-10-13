import ProgressBar from '../../components/fx/ProgressBar';
import TourHelpButton from '../../tutorial/TourHelpButton';
import { ChevronLeft, Brain, Undo2 } from 'lucide-react';
import { dur, ease } from '../../theme/motion';
import { DUE_NEW_DEFAULT } from '../../lib/flashcardDueQueue';
import type { CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import type { CardItem, SessionMeta } from './sessionTypes';


interface SessionTopBarProps {
  theme: Theme; cardWidthClass: string; topBarPaddingClass: string; mobile: boolean; denseLayout: boolean;
  titleStyle: CSSProperties; isDue: boolean; modeAll: boolean; current: CardItem; progress: number;
  meta: SessionMeta | null; cards: CardItem[]; currentIdx: number; canUndoRating: boolean;
  includeNew: number; onExit: () => void; onUndo: () => void; toggleNewCards: () => void;
}

/** Bara de sus a sesiunii: ieșire, titlu, progres, „Anulează”, contor și comutatorul de carduri noi. */
export function SessionTopBar({ theme, cardWidthClass, topBarPaddingClass, mobile, denseLayout, titleStyle, isDue, modeAll, current, progress, meta, cards, currentIdx, canUndoRating, includeNew, onExit, onUndo, toggleNewCards }: SessionTopBarProps) {
  return (
  <div className={`${cardWidthClass} mx-auto w-full`}>
    <div
      className={`luxe-card overflow-hidden rounded-[var(--r-lg)] ${topBarPaddingClass}`}
      style={{ background: theme.modalBg, border: `1px solid ${theme.border}` }}
    >
      <div className={`flex items-center gap-3 ${mobile ? 'flex-wrap' : ''}`}>
        <button
          onClick={onExit}
          className={`press-feedback inline-flex shrink-0 items-center gap-2 rounded-full font-black uppercase tracking-[0.18em] ${denseLayout ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}
          style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          <ChevronLeft size={14} /> Ieșire
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Brain size={14} style={{ color: theme.accentText }} />
            <TourHelpButton tour="flashcardSession" label="Ghid pentru sesiunea de flashcarduri" />
            <h1 className={`font-black tracking-tight leading-normal ${isDue ? 'flex-shrink-0' : 'truncate'}`} style={{ color: theme.text, ...titleStyle }}>
              {isDue ? 'Repetare' : current.quiz.title}
            </h1>
            {isDue && current.groupLabel && (
              <span
                data-testid="card-chapter-chip"
                title={`${current.groupLabel} · ${current.quiz.title}`}
                className="min-w-0 max-w-[60%] flex-shrink truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }}
              >
                {current.groupLabel}
              </span>
            )}
            {isDue && current.isNew && (
              <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ background: `${theme.accent}14`, color: theme.accentText }}>
                Nou
              </span>
            )}
          </div>
          <div className="mt-2">
            <ProgressBar percent={progress * 100} heightClass="h-1.5" track={theme.surface2} color={theme.accent}
              transition={{ duration: dur.base, ease: ease.standard }} label="Progres sesiune" />
            {isDue && meta && meta.remainingDue > 0 && (
              <p className="mt-1 text-[11px]" style={{ color: theme.text3 }}>
                Sesiune de {cards.length - cards.filter((c) => c.isNew).length} din {meta.totalDue} de repetat · restul la „Continuă”
              </p>
            )}
          </div>
        </div>

        <div className={`flex shrink-0 items-center gap-2 ${mobile ? 'w-full justify-between' : ''}`}>
          {canUndoRating && currentIdx > 0 && (
            <button
              onClick={onUndo}
              title="Anulează ultima evaluare și revino la cardul anterior"
              className={`press-feedback inline-flex shrink-0 items-center gap-1.5 rounded-full font-black uppercase tracking-[0.16em] ${denseLayout ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}
              style={{ background: `${theme.warning}12`, color: theme.warning, border: `1px solid ${theme.warning}28` }}
            >
              <Undo2 size={13} /> Anulează
            </button>
          )}
          <span className="rounded-full px-3 py-1.5 text-[11px] font-black tabular-nums" style={{ background: `${theme.accent}14`, color: theme.accentText, border: `1px solid ${theme.accent}24` }}>
            {currentIdx + 1} / {cards.length}
          </span>
          {isDue && (
            <button
              type="button"
              aria-pressed={includeNew > 0}
              onClick={toggleNewCards}
              title="Adaugă la sfârșitul sesiunii și carduri noi, nevăzute încă"
              className="press-feedback rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em]"
              style={includeNew > 0
                ? { background: `${theme.accent}14`, color: theme.accentText, border: `1px solid ${theme.accent}40` }
                : { background: theme.surface2, color: theme.text3, border: `1px solid ${theme.border}` }}
            >
              {includeNew > 0 ? '✓ ' : ''}și cardurile noi (max {includeNew || DUE_NEW_DEFAULT})
            </button>
          )}
          <span className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em]" style={{ background: theme.surface2, color: theme.text3, border: `1px solid ${theme.border}` }}>
            {isDue ? 'De repetat' : modeAll ? 'Tot deck-ul' : 'Due'}
          </span>
        </div>
      </div>
    </div>
  </div>
  );
}
