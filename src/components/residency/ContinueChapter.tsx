import type { CSSProperties } from 'react';
import { BookOpen } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import ProgressBar from '../fx/ProgressBar';
import { BOOK_SHORT } from '../../lib/curriculum';
import { chapterProgress } from './chapterMatch';
import type { PlanProgress } from './useResidencyData';

/**
 * „Continuă de unde ai rămas”: capitolul activ din Organizare azi, cu progresul lui în trecerea curentă.
 * Apare doar când planul a fost deschis și are un topic în lucru; altfel nu se afișează nimic.
 */
export default function ContinueChapter({ plan, onOpen, index = 0 }: { plan: PlanProgress; onOpen: () => void; index?: number }) {
  const theme = useTheme();
  const { focus, state } = plan;
  if (!focus || !state) return null;
  const { chapter, topic } = focus;
  const progress = chapterProgress(chapter, state, focus.phase);

  return (
    <div className="glass-panel fx-rise rounded-2xl px-4 py-3.5" style={{ '--i': index } as CSSProperties}>
      <div className="flex items-center gap-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
          <BookOpen size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px]" style={{ color: theme.text3 }}>Continuă de unde ai rămas · {focus.label}</div>
          <div className="truncate text-[14.5px] font-semibold" style={{ color: theme.text }}>{chapter.label}</div>
          <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
            {BOOK_SHORT[chapter.book]} · {topic.name} · {topic.src.replace(/^\w+ p\./, 'p. ')}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="press-feedback flex-shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
          style={{ background: theme.accent }}
        >
          Deschide
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar percent={progress.percent} color={theme.accent} label={`Progres în ${chapter.title}`} />
        <span className="flex-shrink-0 text-[11.5px] font-semibold tabular-nums" style={{ color: theme.text3 }}>
          {progress.done}/{progress.total} topicuri
        </span>
      </div>
    </div>
  );
}
