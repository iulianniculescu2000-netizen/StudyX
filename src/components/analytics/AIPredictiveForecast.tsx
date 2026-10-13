import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import SectionLabel from '../ui/SectionLabel';
import {
  EXAM_QUESTIONS,
  FORECAST_CONFIDENCE_LABEL,
  PRIOR_ACCURACY,
  UNSEEN_ACCURACY,
  WRONG_PENALTY,
  type DisciplineForecast,
  type ForecastConfidence,
  type ScoreForecast,
  type UnitForecast,
} from '../../lib/analyticsForecast';
import { roCount } from '../../lib/analyticsStats';

interface AIPredictiveForecastProps {
  forecast: ScoreForecast;
}

const SHOWN_DISCIPLINES = 8;
const rise = (index: number) => ({ '--i': index }) as CSSProperties;
const fmt = (n: number) => n.toLocaleString('ro-RO');
const signed = (n: number) => (n < 0 ? `−${fmt(Math.abs(n))}` : fmt(n));

function ConfidenceChip({ level }: { level: ConfidenceLevelProp }) {
  const theme = useTheme();
  const few = level === 'few';
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={few ? { background: `${theme.warning}22`, color: theme.warning } : { background: 'var(--accent-soft)', color: theme.accentText }}
    >
      {FORECAST_CONFIDENCE_LABEL[level]}
    </span>
  );
}
type ConfidenceLevelProp = ForecastConfidence;

/** Bara 0–100% cu segmentul intervalului și o linie la valoarea cea mai probabilă. */
function RangeBar({ low, mid, high, label }: { low: number; mid: number; high: number; label: string }) {
  const theme = useTheme();
  return (
    <div className="relative h-2 rounded-full" style={{ background: 'var(--fill-subtle)' }} role="img" aria-label={label}>
      <div
        className="absolute top-0 h-full rounded-full"
        style={{ left: `${low}%`, width: `${Math.max(2, high - low)}%`, background: theme.accent, opacity: 0.55 }}
      />
      <div className="absolute -top-[3px] h-[14px] w-[3px] rounded-full" style={{ left: `calc(${mid}% - 1px)`, background: theme.accent }} aria-hidden="true" />
    </div>
  );
}

function reasons(unit: UnitForecast): string {
  const parts: string[] = [];
  const unseen = unit.questions - unit.answered;
  if (unseen > 0) parts.push(`${roCount(unseen, 'grilă nerezolvată', 'grile nerezolvate')} din ${fmt(unit.questions)}`);
  if (unit.due > 0) parts.push(`${roCount(unit.due, 'scadentă', 'scadente')} la recapitulare`);
  if (unit.accuracy !== null && unit.accuracy < 80) parts.push(`acuratețe ${unit.accuracy}%`);
  return parts.length > 0 ? parts.join(' · ') : 'ține minte ce ai rezolvat';
}

function MainCard({ forecast }: { forecast: ScoreForecast }) {
  const theme = useTheme();
  const { low, mid, high, net, confidence, trend } = forecast;
  return (
    <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4 sm:p-5" style={rise(0)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11.5px] font-[500]" style={{ color: theme.text3 }}>Acuratețe așteptată la examen</div>
        <ConfidenceChip level={confidence} />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="text-[34px] font-bold leading-none tabular-nums" style={{ color: theme.text, letterSpacing: '-0.03em' }}>
          {low}–{high}%
        </div>
        <div className="text-[13px]" style={{ color: theme.text2 }}>cel mai probabil în jur de {mid}%</div>
      </div>
      <div className="mt-3"><RangeBar low={low} mid={mid} high={high} label={`Prognoză între ${low}% și ${high}%, cel mai probabil ${mid}%`} /></div>

      <div className="mt-4 rounded-[var(--r-sm)] px-3 py-2.5" style={{ background: 'var(--fill-subtle)' }}>
        <div className="text-[11.5px] font-[500]" style={{ color: theme.text3 }}>Scor net estimat la {EXAM_QUESTIONS} de grile</div>
        <div className="mt-0.5 text-[20px] font-bold tabular-nums" style={{ color: theme.text }}>
          {signed(net.low)}–{signed(net.high)} <span className="text-[13px] font-medium" style={{ color: theme.text2 }}>puncte (în jur de {signed(net.mid)})</span>
        </div>
        <div className="mt-0.5 text-[11.5px]" style={{ color: theme.text3 }}>
          Presupunere: răspunzi la toate cele {EXAM_QUESTIONS} de grile, +1 punct pentru o grilă corectă și −{String(WRONG_PENALTY).replace('.', ',')} pentru una greșită. Nu e scorul oficial.
        </div>
      </div>

      {confidence === 'few' && (
        <p className="mt-3 text-[12.5px]" style={{ color: theme.warning }}>
          Date insuficiente: ai rezolvat {roCount(forecast.answered, 'grilă distinctă', 'grile distincte')}, deci intervalul e larg și arată mai mult cât nu știm decât cât știi. Se strânge pe măsură ce rezolvi.
        </p>
      )}
      {trend !== null && trend !== 0 && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: trend > 0 ? theme.success : theme.danger }}>
          {trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {trend > 0 ? '+' : '−'}{Math.abs(trend)} puncte în ultimele 14 zile față de cele 14 dinainte
        </div>
      )}
      <div className="mt-3 text-[12.5px]" style={{ color: theme.text3 }}>
        Din {fmt(forecast.questions)} de grile distincte, ai rezolvat {fmt(forecast.answered)} ({forecast.coverage}%)
        {forecast.due > 0 ? `; ${roCount(forecast.due, 'grilă e scadentă', 'grile sunt scadente')} la recapitulare` : ''}.
      </div>

      <details className="mt-2 text-[12px]" style={{ color: theme.text3 }}>
        <summary className="cursor-pointer select-none font-[500]" style={{ color: theme.text2 }}>Cum se calculează și ce presupune</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Pe fiecare capitol (specialitate sau categorie) iau acuratețea pe grilele rezolvate, trasă spre {Math.round(PRIOR_ACCURACY * 100)}% cu greutatea a 4 grile: puține răspunsuri nu dau un scor mare.</li>
          <li>Grilele nerezolvate se socotesc la {Math.round(UNSEEN_ACCURACY * 100)}% (presupunere), deci acoperirea contează.</li>
          <li>Grilele scadente la recapitulare (SM-2) se estimează mai jos, cu atât mai mult cu cât sunt mai întârziate.</li>
          <li>Trendul (ultimele 14 zile față de cele dinainte) mișcă estimarea cu cel mult 4 puncte și doar cu minimum 15 grile în fiecare fereastră.</li>
          <li>Se ignoră istoricul retras, seturile arhivate, derivate sau combinate și grilele duplicate; o grilă contează o dată.</li>
          <li>Intervalul (~80%) include și o incertitudine fixă între bancă și examenul real. Banca nu e calibrată pe examen: e o orientare, nu o promisiune.</li>
        </ul>
      </details>
    </div>
  );
}

function TopCard({ items }: { items: UnitForecast[] }) {
  const theme = useTheme();
  return (
    <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4" style={rise(1)}>
      <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>Ce ridică prognoza cel mai mult</div>
      <p className="mt-0.5 text-[12px]" style={{ color: theme.text3 }}>
        Primele {items.length} capitole după câte puncte ar adăuga prognozei generale dacă le studiezi (grile noi, recapitulare, greșeli).
      </p>
      <ol className="mt-2">
        {items.map((unit, i) => (
          <li key={unit.key} className="py-3" style={{ borderTop: i === 0 ? undefined : '1px solid var(--hairline)' }}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{unit.label}</div>
                {unit.discipline !== unit.label && <div className="truncate text-[11.5px]" style={{ color: theme.text3 }}>{unit.discipline}</div>}
              </div>
              <span className="flex-shrink-0 text-[13px] font-bold tabular-nums" style={{ color: theme.success }}>
                +{unit.lift.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} puncte
              </span>
            </div>
            <div className="mt-1 text-[12px]" style={{ color: theme.text2 }}>{reasons(unit)}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {unit.quizId && (
                <Link
                  to={`/quiz/${unit.quizId}`}
                  aria-label={`Deschide grile: ${unit.label}`}
                  className="press-feedback rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:brightness-110"
                  style={{ background: theme.accent }}
                >
                  Deschide grile
                </Link>
              )}
              {unit.due > 0 && (
                <Link to="/daily-review" aria-label={`Recapitulare, după ${unit.label}`} className="fine-chip press-feedback rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold" style={{ color: theme.text2 }}>
                  Recapitulare
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DisciplineRow({ item, first }: { item: DisciplineForecast; first: boolean }) {
  const theme = useTheme();
  return (
    <li className="py-2.5" style={{ borderTop: first ? undefined : '1px solid var(--hairline)' }}>
      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="min-w-0 truncate font-[500]" style={{ color: theme.text }}>{item.name}</span>
        <span className="flex-shrink-0 tabular-nums" style={{ color: theme.text2 }}>
          <span className="font-semibold" style={{ color: theme.text }}>{item.low}–{item.high}%</span>
        </span>
      </div>
      <div className="mt-1.5"><RangeBar low={item.low} mid={item.mid} high={item.high} label={`${item.name}: între ${item.low}% și ${item.high}%`} /></div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" style={{ color: theme.text3 }}>
        <span>{fmt(item.answered)} din {fmt(item.questions)} grile rezolvate</span>
        {item.due > 0 && <span>· {roCount(item.due, 'scadentă', 'scadente')}</span>}
        {item.confidence === 'few' && <ConfidenceChip level="few" />}
      </div>
    </li>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <SectionLabel className="mb-2">{children}</SectionLabel>;
}

export default function AIPredictiveForecast({ forecast }: AIPredictiveForecastProps) {
  const theme = useTheme();
  const [all, setAll] = useState(false);

  if (forecast.questions === 0) {
    return (
      <section aria-label="Prognoză de scor" className="space-y-3">
        <Label>Prognoză de scor</Label>
        <div className="glass-panel fx-rise rounded-2xl p-5" style={rise(0)}>
          <div className="text-[15px] font-semibold" style={{ color: theme.text }}>Nu am din ce să calculez o prognoză</div>
          <p className="mt-1 text-[13px]" style={{ color: theme.text3 }}>
            Prognoza apare când ai seturi de grile (de exemplu banca Rezidențiat) și primele răspunsuri.
          </p>
        </div>
      </section>
    );
  }

  const shown = all ? forecast.disciplines : forecast.disciplines.slice(0, SHOWN_DISCIPLINES);
  return (
    <section aria-label="Prognoză de scor" className="space-y-3">
      <Label>Prognoză de scor</Label>
      <MainCard forecast={forecast} />
      {forecast.top.length > 0 && <TopCard items={forecast.top} />}
      {forecast.disciplines.length > 0 && (
        <div className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4" style={rise(2)}>
          <div className="text-[13.5px] font-semibold" style={{ color: theme.text }}>Pe materii</div>
          <ul className="mt-1">
            {shown.map((item, i) => <DisciplineRow key={item.name} item={item} first={i === 0} />)}
          </ul>
          {forecast.disciplines.length > SHOWN_DISCIPLINES && (
            <button
              type="button"
              onClick={() => setAll((value) => !value)}
              aria-expanded={all}
              className="fine-chip press-feedback mt-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold"
              style={{ color: theme.text2 }}
            >
              {all ? 'Arată mai puține' : `Arată toate cele ${forecast.disciplines.length}`}
            </button>
          )}
          <div className="mt-3 text-[11px]" style={{ color: theme.text3 }}>Calculat din răspunsurile tale · Din tot istoricul · Interval de ~80%</div>
        </div>
      )}
    </section>
  );
}
