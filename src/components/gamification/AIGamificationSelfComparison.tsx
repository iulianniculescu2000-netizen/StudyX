import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import {
  BEST_DAY_MIN_QUESTIONS,
  RELIABLE_DAY_MIN_QUESTIONS,
  type DayAccuracy,
  type SelfComparison,
} from '../../lib/gamificationProgress';
import { useTheme } from '../../theme/ThemeContext';
import { comparisonMessage } from './gamificationCatalog';
import ProgressBar from '../fx/ProgressBar';
import SectionLabel from '../ui/SectionLabel';
import { dur, ease } from '../../theme/motion';

interface AIGamificationSelfComparisonProps {
  comparison: SelfComparison;
}

interface Row {
  label: string;
  accuracy: number | null;
  note: string;
  highlight?: boolean;
}

/** Romanian plural: 1 întrebare, 12 întrebări, 25 de întrebări. */
function questionsText(count: number): string {
  if (count === 1) return '1 întrebare';
  const tail = count % 100;
  const needsDe = count > 0 && (tail === 0 || tail >= 20);
  return `${count.toLocaleString('ro-RO')}${needsDe ? ' de' : ''} întrebări`;
}

function parseDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekdayShort(date: string): string {
  return parseDay(date).toLocaleDateString('ro-RO', { weekday: 'short' }).replace('.', '');
}

/** "26 iul." for this year, "26 iul. 2025" for any other, so an old best day is not mistaken for a recent one. */
function shortDate(date: string, currentYear: number): string {
  const day = parseDay(date);
  return day.toLocaleDateString('ro-RO', day.getFullYear() === currentYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function dayNote(day: DayAccuracy): string {
  return day.questions > 0 ? questionsText(day.questions) : 'Fără întrebări';
}

export default function AIGamificationSelfComparison({ comparison }: AIGamificationSelfComparisonProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const { days, today, yesterday, week, best } = comparison;

  const message = comparisonMessage(today.accuracy, yesterday.accuracy);
  const tone = {
    up: { Icon: TrendingUp, color: theme.success },
    down: { Icon: TrendingDown, color: theme.warning },
    flat: { Icon: Minus, color: theme.text3 },
    none: { Icon: Minus, color: theme.text3 },
  }[message.tone];

  const rows: Row[] = [
    { label: 'Azi', accuracy: today.accuracy, note: dayNote(today), highlight: true },
    { label: 'Ieri', accuracy: yesterday.accuracy, note: dayNote(yesterday) },
    {
      label: 'Ultimele 7 zile',
      accuracy: week.accuracy,
      note: week.questions > 0 ? `${questionsText(week.questions)}, media ponderată` : 'Fără întrebări',
    },
    {
      label: 'Cea mai bună zi',
      accuracy: best?.accuracy ?? null,
      note: best
        ? `${shortDate(best.date, parseDay(today.date).getFullYear())}, ${questionsText(best.questions)}, din tot istoricul`
        : `Nicio zi cu cel puțin ${BEST_DAY_MIN_QUESTIONS} întrebări, în tot istoricul`,
    },
  ];

  const summary = days
    .map((day) => {
      const label = day.date === today.date ? 'azi' : weekdayShort(day.date);
      return day.accuracy === null ? `${label}: fără întrebări` : `${label}: ${day.accuracy}% din ${questionsText(day.questions)}`;
    })
    .join('; ');
  const hasFaded = days.some((day) => day.questions > 0 && day.questions < RELIABLE_DAY_MIN_QUESTIONS);

  return (
    <div className="space-y-3">
      <div
        className="glass-panel fx-rise flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{ '--i': 0 } as CSSProperties}
        role="status"
      >
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
          style={{ background: 'var(--fill-subtle)', color: tone.color }}
          aria-hidden="true"
        >
          <tone.Icon className="h-4 w-4" />
        </span>
        <span className="text-[13.5px] font-medium" style={{ color: tone.color === theme.text3 ? theme.text2 : tone.color }}>
          {message.text}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4"
            style={{ '--i': index + 1 } as CSSProperties}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-semibold" style={{ color: theme.text }}>{row.label}</h3>
              <span
                className="text-[22px] font-semibold leading-none tabular-nums"
                style={{ color: row.accuracy === null ? theme.text3 : theme.text }}
              >
                {row.accuracy === null ? '—' : `${row.accuracy}%`}
              </span>
            </div>
            {row.accuracy !== null && (
              <div className="mt-3">
                <ProgressBar percent={row.accuracy} color={row.highlight ? theme.accent : theme.text3} delay={index * 0.04} label={row.label} />
              </div>
            )}
            <p className={`${row.accuracy === null ? 'mt-3' : 'mt-2'} text-[11.5px]`} style={{ color: theme.text3 }}>{row.note}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel fx-rise rounded-2xl p-4" style={{ '--i': 5 } as CSSProperties}>
        <SectionLabel className="!px-0">Acuratețe pe zile</SectionLabel>
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-3" role="img" aria-label={`Acuratețe pe ultimele 7 zile. ${summary}`}>
          {days.map((day, index) => {
            const faded = day.questions > 0 && day.questions < RELIABLE_DAY_MIN_QUESTIONS;
            const isToday = day.date === today.date;
            return (
              <div key={day.date} className="flex min-w-0 flex-col items-center" style={{ opacity: faded ? 0.45 : 1 }}>
                <span className="text-[11px] font-medium tabular-nums" style={{ color: day.accuracy === null ? theme.text3 : theme.text2 }}>
                  {day.accuracy === null ? '—' : `${day.accuracy}%`}
                </span>
                <span className="mt-1.5 flex h-24 w-full max-w-[28px] items-end overflow-hidden rounded-[var(--r-sm)]" style={{ background: 'var(--fill-subtle)' }}>
                  {day.accuracy !== null && (
                    <motion.span
                      className="block w-full rounded-[var(--r-sm)]"
                      style={{ height: `${day.accuracy}%`, background: isToday ? theme.accent : theme.text3, minHeight: 2, originY: 1 }}
                      initial={calmMotion ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={calmMotion ? { duration: 0 } : { duration: dur.slow * 1.4, ease: ease.standard, delay: index * 0.04 }}
                    />
                  )}
                </span>
                <span className="mt-1.5 text-[11px]" style={{ color: isToday ? theme.text : theme.text3, fontWeight: isToday ? 600 : 400 }}>
                  {isToday ? 'azi' : weekdayShort(day.date)}
                </span>
                <span className="text-[10.5px] tabular-nums" style={{ color: theme.text3 }}>
                  {day.questions > 0 ? day.questions : '·'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: theme.text3 }}>
          Sub bară: numărul de întrebări din zi.
          {hasFaded && ` Zilele cu sub ${RELIABLE_DAY_MIN_QUESTIONS} întrebări sunt estompate: procentul lor spune puțin.`}
        </p>
      </div>
    </div>
  );
}
