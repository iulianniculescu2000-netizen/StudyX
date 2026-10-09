import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import SectionLabel from '../ui/SectionLabel';
import { TARGET_ACCURACY, roCount, summaryAgeDays, type GapPriority, type KnowledgeGapItem, type TopicTrend } from '../../lib/analyticsStats';
import type { PlanSummary } from '../../store/organizareStore';

interface AIPredictiveKnowledgeGapsProps {
  gaps: KnowledgeGapItem[];
  /** Topicuri cu suficiente răspunsuri (cel puțin 5) ca să fie evaluate. */
  evaluated: number;
  /** Ruta pentru „Deschide grile” la un topic. */
  quizHref: (topic: string) => string;
  onAskAi: (topic: string) => void;
  /** Întrebări scadente la recapitulare. */
  dueCount: number;
  plan: PlanSummary | null;
  /** Momentul curent (ms), pentru vechimea rezumatului planului. */
  now: number;
}

const PRIORITY_LABEL: Record<GapPriority, string> = {
  mare: 'Prioritate mare',
  medie: 'Prioritate medie',
  mica: 'Prioritate mică',
};

const TREND_LABEL: Record<TopicTrend, string> = {
  improving: 'în creștere',
  declining: 'în scădere',
  stable: 'stabil',
};

const rise = (index: number) => ({ '--i': index }) as CSSProperties;

const Label = ({ children }: { children: ReactNode }) => <SectionLabel className="mb-2">{children}</SectionLabel>;

function GapCard({ gap, index, href, onAskAi, dueCount }: {
  gap: KnowledgeGapItem;
  index: number;
  href: string;
  onAskAi: (topic: string) => void;
  dueCount: number;
}) {
  const theme = useTheme();
  const color = gap.priority === 'mare' ? theme.danger : gap.priority === 'medie' ? theme.warning : theme.success;
  const trend = gap.trend;
  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus;
  const trendColor = trend === 'improving' ? theme.success : trend === 'declining' ? theme.danger : theme.text3;

  return (
    <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4" style={rise(index)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[15.5px] font-semibold" style={{ color: theme.text }}>{gap.topic}</h3>
        <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: `${color}18`, color }}>
          {PRIORITY_LABEL[gap.priority]}
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 text-[12.5px]">
        <span style={{ color: theme.text2 }}>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: theme.text }}>{gap.accuracy}%</span>{' '}
          din {gap.attempts.toLocaleString('ro-RO')} {gap.attempts === 1 ? 'încercare' : 'încercări'}
        </span>
        <span className="tabular-nums" style={{ color: theme.text3 }}>{gap.gap} puncte până la ținta de {TARGET_ACCURACY}%</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full" style={{ background: 'var(--fill-subtle)' }}>
        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${gap.accuracy}%`, background: color }} />
        <div
          className="absolute -top-[3px] h-[12px] w-[2px] rounded-full"
          style={{ left: `${TARGET_ACCURACY}%`, background: theme.text3 }}
          aria-hidden="true"
        />
      </div>

      {trend && (
        <div className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: trendColor }}>
          <TrendIcon size={14} />
          {TREND_LABEL[trend]}
          <span className="font-normal" style={{ color: theme.text3 }}>· după ultimele rezultate din topic</span>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Link
          to={href}
          aria-label={`Deschide grile: ${gap.topic}`}
          className="press-feedback rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
          style={{ background: theme.accent }}
        >
          Deschide grile
        </Link>
        <button
          type="button"
          onClick={() => onAskAi(gap.topic)}
          aria-label={`Explică cu AI: ${gap.topic}`}
          className="fine-chip press-feedback rounded-full px-4 py-2 text-[13px] font-semibold"
          style={{ color: theme.text2 }}
        >
          Explică cu AI
        </button>
        {dueCount > 0 && (
          <Link to="/daily-review" aria-label={`Recapitulare, după ${gap.topic}`} className="fine-chip press-feedback rounded-full px-4 py-2 text-[13px] font-semibold" style={{ color: theme.text2 }}>
            Recapitulare
          </Link>
        )}
      </div>
      <div className="mt-2.5 text-[11px]" style={{ color: theme.text3 }}>Calculat din răspunsurile tale · Din tot istoricul</div>
    </div>
  );
}

export default function AIPredictiveKnowledgeGaps({ gaps, evaluated, quizHref, onAskAi, dueCount, plan, now }: AIPredictiveKnowledgeGapsProps) {
  const theme = useTheme();
  const planAge = plan ? summaryAgeDays(plan.ts, now) : null;

  return (
    <section aria-label="Goluri de cunoștințe" className="space-y-3">
      <Label>Goluri de cunoștințe</Label>
      <p className="-mt-1 px-1 text-[12.5px]" style={{ color: theme.text3 }}>
        Topicuri cu cel puțin 5 încercări, sub {TARGET_ACCURACY}%. Ținta de {TARGET_ACCURACY}% este orientativă, nu un prag oficial.
      </p>

      {plan && (
        <div className="glass-panel fx-lift fx-spot fx-rise flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-2xl p-4" style={rise(0)}>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
            <CalendarDays size={18} />
          </div>
          <div className="min-w-[12rem] flex-1">
            <div className="text-[11.5px] font-[500]" style={{ color: theme.text3 }}>Următorul din plan</div>
            <div className="truncate text-[15px] font-semibold" style={{ color: theme.text }}>{plan.today?.n ?? 'Niciun topic curent în plan'}</div>
            {plan.today && <div className="truncate text-[12px]" style={{ color: theme.text3 }}>{plan.today.g} · {plan.today.src}</div>}
            {planAge !== null && (
              <div className="text-[12px]" style={{ color: theme.warning }}>Planul a fost actualizat acum {roCount(planAge, 'zi', 'zile')}: deschide Organizare ca să-l împrospătezi.</div>
            )}
          </div>
          <Link
            to="/rezidentiat/organizare"
            className="fine-chip press-feedback flex-shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
            style={{ color: theme.text2 }}
          >
            Deschide în Organizare
          </Link>
        </div>
      )}

      {gaps.length > 0 ? (
        gaps.map((gap, i) => (
          <GapCard key={gap.topic} gap={gap} index={i + 1} href={quizHref(gap.topic)} onAskAi={onAskAi} dueCount={dueCount} />
        ))
      ) : (
        <div className="glass-panel fx-rise rounded-2xl p-5" style={rise(1)}>
          <div className="text-[15px] font-semibold" style={{ color: theme.text }}>
            {evaluated > 0 ? `Niciun topic evaluat nu e sub ținta de ${TARGET_ACCURACY}%` : 'Încă nu am destule răspunsuri pe topicuri'}
          </div>
          <p className="mt-1 text-[13px]" style={{ color: theme.text3 }}>
            {evaluated > 0
              ? 'Continuă să rezolvi grile: golurile apar când un topic ajunge la cel puțin 5 încercări și rămâne sub țintă.'
              : 'Un topic se evaluează de la 5 încercări. Rezolvă grile și îți arăt unde ai de recuperat.'}
          </p>
        </div>
      )}
    </section>
  );
}
