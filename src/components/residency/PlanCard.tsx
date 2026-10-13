import { CalendarRange, ChevronRight } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import ProgressRing from '../fx/ProgressRing';
import { daysUntil } from '../../lib/organizare';
import type { PlanSummary } from '../../store/organizareStore';
import { plural } from '../../lib/plural';


/**
 * Where the student is in the Organizare plan: the topic to work on now, the progress of the current
 * pass and the days left. One tap opens the plan. Shown only once the plan has been opened.
 */
export default function PlanCard({ summary, today, onOpen, index = 0 }: { summary: PlanSummary; today: Date; onOpen: () => void; index?: number }) {
  const theme = useTheme();
  const days = daysUntil(summary.exam, today);
  const inPass = summary.phase >= 1 && summary.phase <= 4;
  const eyebrow = inPass ? `Organizare · trecerea ${summary.phase} din 4` : 'Organizare · simulări';
  const title = summary.today?.n ?? (inPass ? 'Planul tău' : 'Simulări cronometrate');
  const meta = summary.today ? `${summary.today.g} · ${summary.today.src}` : `${plural(days, 'zi', 'zile')} până la examen`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-panel fx-lift fx-spot fx-rise press-feedback flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="relative flex-shrink-0">
        <ProgressRing value={inPass ? summary.pct : 100} size={52} stroke={5} label={`${summary.pct}% din pagini`} />
        <div className="absolute inset-0 flex items-center justify-center text-[11.5px] font-bold tabular-nums" style={{ color: theme.text }}>
          {inPass ? `${summary.pct}%` : <CalendarRange size={16} style={{ color: theme.accentText }} />}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>{eyebrow}</div>
        <div className="truncate text-[15px] font-semibold" style={{ color: theme.text }}>{title}</div>
        <div className="truncate text-[12px]" style={{ color: theme.text3 }}>{meta}</div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="hidden rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums sm:inline" style={{ background: 'var(--accent-soft)', color: theme.accentText }}>
          {plural(days, 'zi', 'zile')}
        </span>
        <ChevronRight size={16} style={{ color: theme.text3 }} />
      </div>
    </button>
  );
}
