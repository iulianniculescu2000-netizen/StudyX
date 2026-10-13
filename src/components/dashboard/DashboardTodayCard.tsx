import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, RefreshCw } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { daysUntil } from '../../lib/organizare';
import { localDateStr } from '../../lib/studyPlan';
import type { PlanSummary } from '../../lib/organizare/types';
import SectionLabel from '../ui/SectionLabel';
import { plural } from '../../lib/plural';


export interface DashboardTodayCardProps {
  /** Întrebările scadente, numărate exact ca în pagina de Recapitulare (`buildDueItems`). */
  dueCount: number;
  /** Rezumatul planului din Organizare, dacă a fost deschis vreodată. */
  plan: PlanSummary | null;
  today: Date;
}

/**
 * „Azi”: ce are de făcut studentul acum, din date reale. Un rând pentru recapitulare (doar dacă există
 * întrebări scadente) și unul pentru ținta din plan (doar dacă există plan). Fără date, nu se afișează nimic.
 */
export default function DashboardTodayCard({ dueCount, plan, today }: DashboardTodayCardProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  if (dueCount <= 0 && !plan) return null;

  const days = plan ? daysUntil(plan.exam, today) : 0;
  const inPass = plan ? plan.phase >= 1 && plan.phase <= 4 : false;
  // Rezumatul se scrie doar când se deschide Organizare: topicul e valabil numai în ziua scrierii.
  const fresh = plan ? localDateStr(new Date(plan.ts)) === localDateStr(today) : false;
  const examPassed = plan ? plan.exam < localDateStr(today) : false;
  const todayTopic = fresh && !examPassed ? plan?.today : undefined;
  const planTitle = examPassed ? 'Examenul a trecut' : todayTopic?.n ?? (inPass ? 'Planul tău' : 'Simulări cronometrate');
  const planMeta = examPassed
    ? 'Deschide planul pentru a-l actualiza'
    : todayTopic
      ? `${todayTopic.g} · ${todayTopic.src}`
      : days > 0
        ? `${plural(days, 'zi', 'zile')} până la examen`
        : 'Examenul e astăzi';

  const primary = 'press-feedback focus-ring flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold text-white';
  const secondary = 'press-feedback focus-ring glass-panel flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold';

  return (
    <section aria-label="Azi" className={`mb-5 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 1 } as CSSProperties}>
      <SectionLabel className="mb-2">Azi</SectionLabel>
      <div className="glass-panel overflow-hidden rounded-[var(--r-lg)]" style={{
        background: 'linear-gradient(125deg, var(--accent-soft), transparent 65%), var(--glass-panel-strong)',
        borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--glass-border))',
      }}>
        {dueCount > 0 && (
          <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 px-4 py-5 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:px-5">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
              style={{ background: `${theme.accent}18`, color: theme.accentText }}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-snug tracking-tight tabular-nums sm:text-xl" style={{ color: theme.text }}>
                {plural(dueCount, 'întrebare', 'întrebări')} de recapitulat
              </div>
              <div className="mt-1 text-[12px] leading-relaxed" style={{ color: theme.text3 }}>Din coada zilnică de recapitulare</div>
            </div>
            <Link to="/daily-review" className={`${primary} col-start-2 text-center sm:col-start-auto`} style={{ background: theme.accent }}>Recapitulează</Link>
          </div>
        )}
        {plan && (
          <div
            className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 px-4 py-3.5 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:px-5"
            style={{ borderTop: dueCount > 0 ? '1px solid var(--hairline)' : undefined }}
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
              style={{ background: dueCount > 0 ? theme.fillSubtle : `${theme.accent}18`, color: dueCount > 0 ? theme.text3 : theme.accentText }}
            >
              <CalendarRange size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>
                {examPassed ? 'Organizare' : inPass ? `Organizare · trecerea ${plan.phase} din 4` : 'Organizare · simulări'}
              </div>
              <div className="break-words text-[15px] font-semibold leading-snug" style={{ color: theme.text }}>{planTitle}</div>
              <div className="mt-0.5 break-words text-[12px] leading-relaxed" style={{ color: theme.text3 }}>{planMeta}</div>
            </div>
            <Link to="/rezidentiat/organizare" className={`${dueCount > 0 ? secondary : primary} col-start-2 text-center sm:col-start-auto`}
              style={dueCount > 0 ? { color: theme.accentText } : { background: theme.accent }}>Deschide planul</Link>
          </div>
        )}
      </div>
    </section>
  );
}
