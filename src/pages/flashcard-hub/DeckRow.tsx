import { memo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FolderInput, Pencil, Trash2 } from 'lucide-react';
import type { Quiz } from '../../types';
import type { Theme } from '../../theme/themes';
import { type FlashcardDeckSummary } from './sections';
import { BookTag, DueBadge, NewDot, RepeatLink, SegmentedBar } from './chapterParts';
import { REVEAL, ROW_HEIGHT, restanteLabel, QUIZ_DRAG_MIME } from './deckTreeShared';

/* ═══════════════════════════ Rând de pachet ═══════════════════════════ */

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-shrink-0 -rotate-90">
      <circle cx="8" cy="8" r={radius} fill="none" strokeWidth="2.5" stroke={color} strokeOpacity="0.22" />
      {pct > 0 && (
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(pct, 100) / 100)}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-emphasized)' }}
        />
      )}
    </svg>
  );
}

interface DeckRowProps {
  deck: FlashcardDeckSummary;
  depth: number;
  theme: Theme;
  moving: boolean;
  virtualize: boolean;
  /** Rând de capitol: etichetă „Cap. N”, bară de progres, „N de repetat” și „Repetă”. */
  chapter?: { tag: string | null };
  onEdit: (quiz: Quiz) => void;
  onDelete: (quiz: Quiz) => void;
  onOpenMove: (quizId: string, anchor: HTMLElement | null) => void;
  onDragEnd: () => void;
}

export const DeckRow = memo(function DeckRow({ deck, depth, theme, moving, virtualize, chapter, onEdit, onDelete, onOpenMove, onDragEnd }: DeckRowProps) {
  const { quiz } = deck;
  const moveRef = useRef<HTMLButtonElement>(null);
  const ringColor = deck.due > 0 ? theme.warning : deck.masteryPct >= 80 ? theme.success : theme.accent;
  const summary = `${quiz.title}: ${deck.total} carduri, ${deck.masteryPct}% stăpânit${deck.due > 0 ? `, ${restanteLabel(deck.due)}` : ''}${deck.seen === 0 ? ', nou' : ''}`;
  const actionClass = 'press-feedback flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] [@media(hover:none)]:h-8 [@media(hover:none)]:w-8';

  return (
    <div
      data-testid="deck-row"
      data-deck-id={quiz.id}
      draggable
      onDragStartCapture={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(QUIZ_DRAG_MIME, quiz.id);
        event.dataTransfer.setData('text/plain', quiz.id);
        event.currentTarget.style.opacity = '0.55';
      }}
      onDragEndCapture={(event) => {
        event.currentTarget.style.opacity = '';
        onDragEnd();
      }}
      className="group fine-row relative flex items-center"
      style={{
        height: ROW_HEIGHT,
        paddingLeft: 14 + depth * 16,
        borderRadius: 0,
        borderTop: '1px solid var(--hairline)',
        ...(virtualize ? { contentVisibility: 'auto', containIntrinsicSize: `auto ${ROW_HEIGHT}px` } : null),
      }}
    >
      <Link
        to={`/flashcards/session/${quiz.id}`}
        title={summary}
        aria-label={summary}
        className="focus-ring flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-[var(--r-sm)]"
      >
        <ProgressRing pct={deck.masteryPct} color={ringColor} />
        <span className="min-w-0 truncate text-[13.5px] font-medium" style={{ color: theme.text }}>{quiz.title}</span>
        {chapter?.tag && <BookTag tag={chapter.tag} theme={theme} />}
        {!chapter && deck.due > 0 && (
          <span
            className="flex-shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold"
            style={{ color: theme.warning, background: `${theme.warning}1f` }}
          >
            {restanteLabel(deck.due)}
          </span>
        )}
        {deck.seen === 0 && <NewDot theme={theme} />}
      </Link>

      {chapter && (
        <>
          <span className="hidden sm:flex"><SegmentedBar stats={deck} theme={theme} /></span>
          <span className="mx-2 hidden w-[92px] flex-shrink-0 justify-end sm:flex">
            {deck.due > 0 && <DueBadge count={deck.due} theme={theme} />}
          </span>
          <span className="flex w-[68px] flex-shrink-0 justify-end">
            {deck.due > 0 && (
              <RepeatLink to={`/flashcards/session/${quiz.id}`} label={`Repetă ${quiz.title}: ${restanteLabel(deck.due)}`} theme={theme} />
            )}
          </span>
        </>
      )}

      <div className="relative flex h-full w-[100px] flex-shrink-0 items-center justify-end pr-3 [@media(hover:none)]:w-[116px]">
        <span
          className={`text-[12px] tabular-nums group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:hidden ${moving ? 'opacity-0' : ''}`}
          style={{ color: theme.text3, transition: 'opacity var(--dur-fast) var(--ease-standard)' }}
        >
          {deck.total} carduri
        </span>
        <div
          className={`absolute inset-y-0 right-1.5 flex items-center ${moving ? 'opacity-100' : REVEAL}`}
          style={{ transition: 'opacity var(--dur-fast) var(--ease-standard)' }}
        >
          <button
            ref={moveRef}
            type="button"
            onClick={() => onOpenMove(quiz.id, moveRef.current)}
            aria-label={`Mută pachetul ${quiz.title} în…`}
            aria-haspopup="menu"
            aria-expanded={moving}
            title="Mută în…"
            className={actionClass}
            style={{ color: theme.text3 }}
          >
            <FolderInput size={14} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(quiz)}
            aria-label={`Editează pachetul ${quiz.title}`}
            title="Editează"
            className={actionClass}
            style={{ color: theme.text3 }}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(quiz)}
            aria-label={`Șterge pachetul ${quiz.title}`}
            title="Șterge"
            className={actionClass}
            style={{ color: theme.text3 }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
});

/* ═══════════════════════════ Antet de grup ═══════════════════════════ */
