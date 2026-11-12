import { useMemo } from 'react';
import type { Question, Quiz, QuizSession } from '../../types';
import { useTheme } from '../../theme/ThemeContext';
import { chapterBreakdown, compareWithPrevious, examTotals, kindBreakdown, paceEstimate, previousSimulations, type GroupResult } from '../../lib/examReport';

interface ExamReportProps {
  questions: Question[];
  session: QuizSession;
  sessions: QuizSession[];
  quizzes: Quiz[];
  duration: number;
}

const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
const num = (value: number) => String(value).replace('.', ',');

/** Raport de la finalul unei simulări: capitole, CS/CM, comparație cu simulările anterioare și estimare din ritm. */
export default function ExamReport({ questions, session, sessions, quizzes, duration }: ExamReportProps) {
  const theme = useTheme();
  const report = useMemo(() => {
    const totals = examTotals(questions, session.answers);
    const previous = previousSimulations(quizzes, sessions, session.id);
    return {
      totals,
      chapters: chapterBreakdown(questions, session.answers),
      kinds: kindBreakdown(questions, session.answers),
      comparison: compareWithPrevious(totals.percent, previous),
      pace: paceEstimate(questions, session.answers, duration),
    };
  }, [questions, session, sessions, quizzes, duration]);

  const tone = (accuracy: number | null) => (accuracy === null ? theme.text3 : accuracy >= 75 ? theme.success : accuracy >= 50 ? theme.warning : theme.danger);
  const rows = (items: GroupResult[]) => (
    <ul className="space-y-2">
      {items.map((row) => (
        <li key={row.label} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="min-w-0 flex-1 truncate" style={{ color: theme.text2 }}>{row.label}</span>
          <span className="tabular-nums" style={{ color: theme.text3 }}>
            {row.correct}/{row.total}{row.answered < row.total ? ` · ${row.total - row.answered} fără răspuns` : ''} · {num(row.net)} pct
          </span>
          <span className="w-12 text-right font-semibold tabular-nums" style={{ color: tone(row.accuracy) }}>{row.accuracy === null ? '–' : `${row.accuracy}%`}</span>
        </li>
      ))}
    </ul>
  );

  const { comparison, pace, chapters, kinds } = report;
  return (
    <section className="glass-panel mb-6 space-y-5 rounded-[var(--r-lg)] p-5" aria-label="Raportul simulării">
      <h2 className="text-[13px] font-semibold" style={{ color: theme.text }}>Raportul simulării</h2>

      {chapters.length > 1 && (
        <div>
          <h3 className="mb-2 text-[12px] font-semibold" style={{ color: theme.text2 }}>Pe capitole, cele mai slabe întâi</h3>
          {rows(chapters.slice(0, 8))}
          {chapters.length > 8 && <p className="mt-2 text-[12px]" style={{ color: theme.text3 }}>Plus încă {chapters.length - 8} capitole cu rezultate mai bune.</p>}
        </div>
      )}

      {kinds.length > 1 && (
        <div>
          <h3 className="mb-2 text-[12px] font-semibold" style={{ color: theme.text2 }}>CS (un răspuns) și CM (mai multe)</h3>
          {rows(kinds)}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: theme.text2 }}>Față de simulările anterioare</h3>
        {comparison ? (
          <p className="text-[13px] leading-relaxed" style={{ color: theme.text2 }}>
            Acum {report.totals.percent}% din punctajul maxim. Media celor {comparison.previous.length === 1 ? 'anterioare (una)' : `${comparison.previous.length} anterioare`} e {comparison.average}%
            {' '}({signed(comparison.delta)} puncte procentuale), iar ultima a fost {comparison.previous[0].percent}% ({signed(comparison.deltaLast)}).
          </p>
        ) : (
          <p className="text-[13px]" style={{ color: theme.text3 }}>Aceasta e prima ta simulare. De la a doua o comparăm cu cele de dinainte.</p>
        )}
      </div>

      {pace && (
        <div>
          <h3 className="mb-2 text-[12px] font-semibold" style={{ color: theme.text2 }}>Estimare din ritm</h3>
          <p className="text-[13px] leading-relaxed" style={{ color: theme.text2 }}>
            Ai răspuns la {pace.answered} din {pace.answered + pace.unanswered}, cu circa {pace.secondsPerQuestion} s pe grilă (aveai {pace.secondsAvailable} s).
            Dacă ți-ar fi ajuns timpul și ai fi păstrat aceeași acuratețe, ai fi avut în jur de {num(pace.mid)} din {pace.max} puncte,
            probabil între {num(pace.low)} și {num(pace.high)}.
          </p>
          <p className="mt-1 text-[12px]" style={{ color: theme.text3 }}>
            Orientativ, din această singură simulare: nu prezice rezultatul examenului real.
          </p>
        </div>
      )}
    </section>
  );
}
