import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import SectionLabel from '../ui/SectionLabel';
import { useCountUp } from '../../hooks/useCountUp';
import ProgressRing from '../fx/ProgressRing';
import {
  CONFIDENCE_LABEL,
  MIN_QUESTIONS_FOR_ESTIMATE,
  MIN_WINDOW_QUESTIONS,
  PERIODS,
  roCount,
  type LoggedWindow,
  type Pace,
  type PeriodDays,
  type Readiness,
  type TopicBuckets,
  type WindowComparison,
} from '../../lib/analyticsStats';
import type { ExamDateInfo } from '../../lib/examDate';

interface AIPredictiveReadinessProps {
  exam: { primary: ExamDateInfo | null; others: ExamDateInfo[] };
  ready: Readiness;
  /** Există măcar un răspuns sau o sesiune terminată. */
  hasAnyData: boolean;
  dueCount: number;
  /** Grile pe zi până la examen; null fără examen sau după examen. */
  needed: number | null;
  /** Grile pe zi în sesiuni (null fără nicio sesiune). */
  pace: Pace | null;
  period: PeriodDays;
  win: WindowComparison;
  studyDays: number;
  logged: LoggedWindow;
  /** Greșeli păstrate în profil care cad în perioadă. */
  mistakes: number;
  /** Secunde, din tot istoricul. */
  totalStudyTime: number;
  buckets: TopicBuckets;
}

const fmt = (n: number, digits = 0) => n.toLocaleString('ro-RO', { maximumFractionDigits: digits });
const plural = roCount;

function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

const rise = (index: number) => ({ '--i': index }) as CSSProperties;

const Label = ({ children }: { children: ReactNode }) => <SectionLabel className="mb-2">{children}</SectionLabel>;

function Scope({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <div className="mt-2 text-[11px]" style={{ color: theme.text3 }}>{children}</div>;
}

function ActionLink({ to, children, primary }: { to: string; children: ReactNode; primary?: boolean }) {
  const theme = useTheme();
  return (
    <Link
      to={to}
      className={`press-feedback rounded-full px-4 py-2 text-[13px] font-semibold ${primary ? 'text-white hover:brightness-110' : 'fine-chip'}`}
      style={primary ? { background: theme.accent } : { color: theme.text2 }}
    >
      {children}
    </Link>
  );
}

function ExamCard({ exam, index }: { exam: AIPredictiveReadinessProps['exam']; index: number }) {
  const theme = useTheme();
  const { primary, others } = exam;
  return (
    <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4" style={rise(index)}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
          <CalendarClock size={18} />
        </div>
        {primary ? (
          <div className="min-w-[12rem] flex-1">
            <div className="text-[11.5px] font-[500]" style={{ color: theme.text3 }}>{primary.label}</div>
            <div className="text-[15px] font-semibold" style={{ color: theme.text }}>
              {primary.passed ? `A fost pe ${formatDay(primary.date)}` : formatDay(primary.date)}
            </div>
            <div className="text-[12.5px]" style={{ color: primary.passed ? theme.warning : theme.text2 }}>
              {primary.passed
                ? 'Examenul a trecut. Setează o dată nouă în Organizare.'
                : primary.daysLeft === 0 ? 'Examenul este azi' : `${plural(primary.daysLeft, 'zi rămasă', 'zile rămase')}`}
            </div>
            {primary.estimate && !primary.passed && (
              <div className="mt-0.5 text-[12px]" style={{ color: theme.text3 }}>Încă nu ai ales tu data: e cea din planul de bază.</div>
            )}
          </div>
        ) : (
          <div className="min-w-[12rem] flex-1">
            <div className="text-[15px] font-semibold" style={{ color: theme.text }}>Nu ai setat data examenului</div>
            <div className="text-[12.5px]" style={{ color: theme.text3 }}>Fără ea nu pot calcula ritmul necesar.</div>
          </div>
        )}
        {!primary || primary.passed || primary.estimate
          ? <ActionLink to="/rezidentiat/organizare">{primary?.estimate && !primary.passed ? 'Confirmă în Organizare' : 'Setează în Organizare'}</ActionLink>
          : null}
      </div>
      {others.length > 0 && (
        <div className="mt-3.5 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
          <div className="mb-1.5 text-[11.5px] font-[500]" style={{ color: theme.text3 }}>Alte examene</div>
          <ul className="space-y-1.5">
            {others.map((other) => (
              <li key={`${other.label}-${other.date}`} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate" style={{ color: theme.text2 }}>{other.label}</span>
                <span className="flex-shrink-0 tabular-nums" style={{ color: theme.text3 }}>
                  {formatDay(other.date)} · {other.daysLeft === 0 ? 'azi' : plural(other.daysLeft, 'zi', 'zile')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EmptyCard({ answered, index }: { answered: number; index: number }) {
  const theme = useTheme();
  return (
    <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-5" style={rise(index)}>
      <div className="text-[16px] font-semibold" style={{ color: theme.text }}>
        Rezolvă cel puțin {MIN_QUESTIONS_FOR_ESTIMATE} grile ca să-ți arăt unde ești
      </div>
      <p className="mt-1 text-[13px]" style={{ color: theme.text3 }}>
        {answered > 0
          ? `Până acum ai rezolvat ${plural(answered, 'grilă distinctă', 'grile distincte')}. Sub ${MIN_QUESTIONS_FOR_ESTIMATE} nu arăt nicio estimare, ca să nu pară mai sigură decât e.`
          : 'Nu arăt nicio estimare până nu am răspunsuri reale din care să o calculez.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionLink to="/rezidentiat" primary>Rezolvă grile</ActionLink>
        <ActionLink to="/rezidentiat/organizare">Setează data examenului</ActionLink>
      </div>
    </div>
  );
}

function EstimateCard({ ready, index }: { ready: Readiness; index: number }) {
  const theme = useTheme();
  const accuracy = useCountUp(ready.accuracy);
  const level = ready.level === 'none' ? null : CONFIDENCE_LABEL[ready.level];
  return (
    <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4" style={rise(index)}>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <ProgressRing value={ready.coverage} size={76} stroke={7} label={`${ready.coverage}% din grile rezolvate`} />
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-[15px] font-bold tabular-nums" style={{ color: theme.text }}>{ready.coverage}%</span>
            <span className="mt-0.5 text-[9.5px]" style={{ color: theme.text3 }}>acoperire</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11.5px] font-[500]" style={{ color: theme.text3 }}>Acuratețe pe grilele rezolvate</div>
            {level && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--accent-soft)', color: theme.accentText }}>{level}</span>
            )}
          </div>
          <div className="mt-0.5 text-[34px] font-bold leading-none tabular-nums" style={{ color: theme.text, letterSpacing: '-0.03em' }}>{accuracy}%</div>
          <p className="mt-1.5 text-[13px]" style={{ color: theme.text2 }}>
            {ready.interval
              ? `${ready.accuracy}%, probabil între ${ready.interval.lo}% și ${ready.interval.hi}%, din ${plural(ready.answered, 'grilă distinctă', 'grile distincte')}.`
              : null}
          </p>
        </div>
      </div>
      <div className="mt-3 text-[12.5px]" style={{ color: theme.text3 }}>
        Ai rezolvat {fmt(ready.answered)} din {fmt(ready.total)} grile ({plural(ready.attempts, 'încercare', 'încercări')} în total). „Total” înseamnă grilele distincte din seturile tale, fără seturile arhivate, pachetele de flashcarduri și seturile făcute din greșeli sau simulări. Nu este un scor prezis pentru examen: grilele din bancă nu sunt calibrate pe el.
      </div>
      {ready.sufficient && (
        <div className="mt-2 text-[12.5px]" style={{ color: theme.text3 }}>
          Intervalul presupune că grilele rezolvate reprezintă toată materia; acoperirea e {ready.coverage}%.
        </div>
      )}
      <details className="mt-2 text-[12px]" style={{ color: theme.text3 }}>
        <summary className="cursor-pointer select-none font-[500]" style={{ color: theme.text2 }}>Cum se calculează</summary>
        <p className="mt-1.5">
          Pentru fiecare grilă rezolvată calculez ce parte din încercări au fost corecte, apoi fac media pe grile distincte. Intervalul (Wilson, 95%) se strânge pe măsură ce rezolvi mai multe grile diferite; repetările aceleiași grile nu îl strâng. Media pe grilă subestimează pe cine se îmbunătățește, pentru că greșelile vechi rămân în ea.
        </p>
      </details>
      <Scope>Calculat din răspunsurile tale · Din tot istoricul</Scope>
    </div>
  );
}

function Tile({ label, value, sub, scope, trend, index, to }: {
  label: string;
  value: string;
  sub?: string;
  scope: string;
  trend?: { delta: number } | null;
  index: number;
  to?: string;
}) {
  const theme = useTheme();
  const body = (
    <>
      <div className="text-[11.5px] font-[500]" style={{ color: theme.text3 }}>{label}</div>
      <div className="mt-1 text-[24px] font-bold leading-none tabular-nums" style={{ color: theme.text, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div className="mt-1 text-[12px]" style={{ color: theme.text2 }}>{sub}</div>}
      {trend && trend.delta !== 0 && (
        <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: trend.delta > 0 ? theme.success : theme.danger }}>
          {trend.delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {trend.delta > 0 ? '+' : '−'}{Math.abs(trend.delta)} puncte față de perioada anterioară
        </div>
      )}
      {trend && trend.delta === 0 && (
        <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: theme.text3 }}>
          <Minus size={13} /> la fel ca perioada anterioară
        </div>
      )}
      <Scope>{scope}</Scope>
    </>
  );
  const className = 'glass-panel fx-lift fx-spot fx-rise block rounded-2xl p-4';
  return to
    ? <Link to={to} className={`${className} press-feedback`} style={rise(index)}>{body}</Link>
    : <div className={className} style={rise(index)}>{body}</div>;
}

function TopicRow({ name, accuracy, total, first }: { name: string; accuracy: number; total: number; first: boolean }) {
  const theme = useTheme();
  return (
    <li className="flex items-baseline justify-between gap-3 py-2 text-[13.5px]" style={{ borderTop: first ? undefined : '1px solid var(--hairline)' }}>
      <span className="min-w-0 truncate font-[500]" style={{ color: theme.text }}>{name}</span>
      <span className="flex-shrink-0 tabular-nums" style={{ color: theme.text3 }}>
        <span className="font-semibold" style={{ color: theme.text2 }}>{accuracy}%</span> · {plural(total, 'încercare', 'încercări')}
      </span>
    </li>
  );
}

function TopicsCard({ buckets, index }: { buckets: TopicBuckets; index: number }) {
  const theme = useTheme();
  const { weak, strong, unrated } = buckets;
  return (
    <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4" style={rise(index)}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[12.5px] font-semibold" style={{ color: theme.danger }}>Topicuri slabe</div>
          {weak.length > 0 ? (
            <ul>{weak.slice(0, 5).map((t, i) => <TopicRow key={t.topic} name={t.topic} accuracy={t.accuracy} total={t.total} first={i === 0} />)}</ul>
          ) : (
            <p className="text-[12.5px]" style={{ color: theme.text3 }}>Niciun topic evaluat nu e sub prag.</p>
          )}
        </div>
        <div>
          <div className="mb-1 text-[12.5px] font-semibold" style={{ color: theme.success }}>Topicuri tari</div>
          {strong.length > 0 ? (
            <ul>{strong.slice(0, 5).map((t, i) => <TopicRow key={t.topic} name={t.topic} accuracy={t.accuracy} total={t.total} first={i === 0} />)}</ul>
          ) : (
            <p className="text-[12.5px]" style={{ color: theme.text3 }}>Un topic devine „tare” după 10 încercări cu cel puțin 80%.</p>
          )}
        </div>
      </div>
      {unrated > 0 && (
        <p className="mt-3 text-[12.5px]" style={{ color: theme.text3 }}>
          {plural(unrated, 'topic are', 'topicuri au')} prea puține răspunsuri (sub 5) ca să fie evaluat.
        </p>
      )}
      <Scope>Calculat din răspunsurile tale · Din tot istoricul</Scope>
    </div>
  );
}

export default function AIPredictiveReadiness({
  exam, ready, hasAnyData, dueCount, needed, pace, period, win, studyDays, logged, mistakes, totalStudyTime, buckets,
}: AIPredictiveReadinessProps) {
  const theme = useTheme();
  const span = PERIODS.find((p) => p.days === period)?.span ?? '';
  const estimated = ready.level !== 'none';
  const { current } = win;

  return (
    <section aria-label="Pregătire" className="space-y-3">
      <Label>Pregătire</Label>
      <ExamCard exam={exam} index={0} />
      {estimated ? <EstimateCard ready={ready} index={1} /> : <EmptyCard answered={ready.answered} index={1} />}

      {hasAnyData && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              index={3}
              label="Restante la recapitulare"
              value={fmt(dueCount)}
              sub={dueCount > 0 ? 'Deschide recapitularea' : 'Nimic de recapitulat acum'}
              scope="Calculat din răspunsurile tale · Din tot istoricul"
              to={dueCount > 0 ? '/daily-review' : undefined}
            />
            <Tile
              index={4}
              label="Ritm necesar"
              value={needed === null ? '—' : fmt(needed)}
              sub={needed === null ? (exam.primary?.passed ? 'Examenul a trecut' : 'Fără data examenului') : 'grile distincte nerezolvate, pe zi, până la examen'}
              scope="Din grilele nerezolvate și zilele rămase"
            />
            <Tile
              index={5}
              label="Grile în sesiuni, pe zi"
              value={pace ? fmt(pace.perDay, 1) : '—'}
              sub={pace ? 'cu repetări, deci nu e comparabil 1:1 cu ritmul necesar' : 'Nicio sesiune terminată încă'}
              scope={pace ? `În ultimele ${plural(pace.days, 'zi', 'zile')}` : 'Din sesiunile terminate'}
            />
          </div>

          <div className="pt-2"><Label>{span}</Label></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile
              index={6}
              label="Grile rezolvate"
              value={fmt(current.solved)}
              sub={plural(current.sessions, 'sesiune', 'sesiuni')}
              scope={span}
            />
            <Tile
              index={7}
              label="Acuratețe în sesiuni"
              value={current.accuracy === null ? '—' : `${current.accuracy}%`}
              sub={current.accuracy === null
                ? `Prea puține grile în perioadă (${fmt(current.solved)}; minimum ${MIN_WINDOW_QUESTIONS})`
                : `${plural(current.solved, 'grilă', 'grile')} în perioadă · ${plural(win.previous.solved, 'grilă', 'grile')} în cea anterioară`}
              trend={win.delta === null ? null : { delta: win.delta }}
              scope={win.delta === null && current.accuracy !== null ? `${span} · diferența apare de la 30 de grile în fiecare perioadă` : span}
            />
            <Tile
              index={8}
              label="Zile active"
              value={`${fmt(studyDays)} din ${fmt(period)}`}
              scope={span}
            />
            {logged.entries > 0 && (
              <Tile
                index={9}
                label="Ore notate în Organizare"
                value={`${fmt(logged.hours, 1)} h`}
                sub={plural(logged.entries, 'zi notată', 'zile notate')}
                scope={span}
              />
            )}
            <Tile
              index={10}
              label="Greșeli recente păstrate"
              value={fmt(mistakes)}
              sub="din ultimele greșeli păstrate (cel mult 12)"
              scope={span}
            />
            <Tile
              index={11}
              label="Timp total de studiu"
              value={totalStudyTime > 0 ? formatDuration(totalStudyTime) : '—'}
              scope="Din tot istoricul"
            />
          </div>

          <div className="pt-2"><Label>Topicuri</Label></div>
          <TopicsCard buckets={buckets} index={12} />
        </>
      )}
      {!hasAnyData && (
        <p className="px-1 text-[12px]" style={{ color: theme.text3 }}>Cifrele apar aici după primele tale răspunsuri.</p>
      )}
    </section>
  );
}
