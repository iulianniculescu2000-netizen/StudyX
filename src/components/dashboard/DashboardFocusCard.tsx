import type { CSSProperties } from 'react';
import { RotateCcw, Target } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import type { StudyFocusItem } from '../../lib/topicMastery';
import SectionLabel from '../ui/SectionLabel';
import { plural } from '../../lib/plural';

export interface DashboardFocusCardProps {
  items: StudyFocusItem[];
  onPractice: (topic: string) => void;
  /** Grile noi generate de AI pe subiect. Lipsește când nu există o cheie AI: butonul nu se afișează. */
  onGenerate?: (topic: string) => void;
  /** Subiectul pentru care se generează acum, ca butonul să arate că lucrează și să nu pornească de două ori. */
  generatingTopic?: string | null;
}

/**
 * „Pentru tine”: subiectele care merită atenție azi, calculate local din răspunsurile tale. Un rând pe subiect,
 * cu motivul în cifre și o singură acțiune. Fără suficiente răspunsuri, nu se afișează nimic.
 */
export default function DashboardFocusCard({ items, onPractice, onGenerate, generatingTopic = null }: DashboardFocusCardProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  if (items.length === 0) return null;

  return (
    <section aria-label="Pentru tine" className={`mb-5 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 2 } as CSSProperties}>
      <SectionLabel className="mb-2">Pentru tine</SectionLabel>
      <div className="glass-panel overflow-hidden rounded-[var(--r-lg)]" style={{ background: 'var(--glass-panel-strong)' }}>
        {items.map(({ kind, topic }, index) => {
          const weak = kind === 'weak';
          const Icon = weak ? Target : RotateCcw;
          const reason = weak
            ? `${plural(topic.wrong, 'greșeală', 'greșeli')} din ${plural(topic.answered, 'răspuns', 'răspunsuri')}`
            : `Nu l-ai mai atins de ${plural(topic.daysSince, 'zi', 'zile')}`;
          return (
            <div
              key={topic.topic}
              className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 px-4 py-3.5 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:px-5"
              style={{ borderTop: index > 0 ? '1px solid var(--hairline)' : undefined }}
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
                style={{ background: weak ? `${theme.danger}18` : `${theme.accent}18`, color: weak ? theme.danger : theme.accentText }}
              >
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="break-words text-[15px] font-semibold leading-snug" style={{ color: theme.text }}>{topic.topic}</div>
                <div className="mt-0.5 break-words text-[12px] leading-relaxed" style={{ color: theme.text3 }}>
                  {reason}
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">stăpânire {topic.mastery}%</span>
                </div>
              </div>
              <div className="col-start-2 flex flex-shrink-0 flex-wrap items-center gap-2 sm:col-start-auto">
              {weak && onGenerate && (
                <button
                  type="button"
                  onClick={() => onGenerate(topic.topic)}
                  disabled={generatingTopic !== null}
                  aria-label={`Grile noi despre ${topic.topic}`}
                  className="press-feedback focus-ring glass-panel rounded-full px-4 py-1.5 text-center text-[13px] font-semibold disabled:opacity-60"
                  style={{ color: theme.accentText }}
                >
                  {generatingTopic === topic.topic ? 'Generez…' : 'Grile noi'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onPractice(topic.topic)}
                aria-label={`Exersează ${topic.topic}`}
                className={`press-feedback focus-ring flex-shrink-0 rounded-full px-4 py-1.5 text-center text-[13px] font-semibold ${weak ? 'text-white' : 'glass-panel'}`}
                style={weak ? { background: theme.accent } : { color: theme.accentText }}
              >
                Exersează
              </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
