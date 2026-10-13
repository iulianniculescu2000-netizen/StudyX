import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useExamCrunch } from '../../lib/examCrunchHook';
import SectionLabel from '../ui/SectionLabel';
import { plural } from '../../lib/plural';


/**
 * Planul „aproape de examen”: apare când examenul e în cel mult 30 de zile sau când utilizatorul îl
 * activează. Un buton pornește direct sesiunea de 30 de minute; detaliile sunt în /aproape-examen.
 */
export default function DashboardCrunchCard() {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const { visible, daysLeft, pool, options, start } = useExamCrunch();
  if (!visible) return null;

  const total = pool.due.length + pool.missed.length + pool.gaps.length;
  const thirty = options.find((option) => option.minutes === 30);
  const canStart = !!thirty && thirty.size > 0;

  return (
    <section aria-label="Aproape de examen" className={`mb-5 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 2 } as CSSProperties}>
      <SectionLabel className="mb-2">Aproape de examen</SectionLabel>
      <div className="glass-panel fx-spot flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] px-4 py-3.5" style={{ boxShadow: 'var(--elev-1)' }}>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
          <Hourglass size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <div className="text-[15px] font-semibold tabular-nums" style={{ color: theme.text }}>
            {daysLeft !== null ? `${plural(daysLeft, 'zi', 'zile')} până la examen` : 'Sesiune de consolidare'}
          </div>
          <div className="text-[12px] tabular-nums" style={{ color: theme.text3 }}>
            {total > 0
              ? `${pool.due.length} scadente · ${pool.missed.length} greșite des · ${pool.gaps.length} lacune`
              : 'Nimic de recuperat acum'}
          </div>
        </div>
        <Link to="/aproape-examen" className="press-feedback focus-ring glass-panel flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold" style={{ color: theme.accentText }}>Detalii</Link>
        <button
          type="button"
          disabled={!canStart}
          onClick={() => start(30)}
          className="press-feedback focus-ring flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: theme.accent }}
        >
          Pornește 30 min
        </button>
      </div>
    </section>
  );
}
