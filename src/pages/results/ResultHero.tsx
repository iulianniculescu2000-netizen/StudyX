import { plural } from '../../lib/plural';
import { motion } from 'framer-motion';
import { Scale, type LucideIcon } from 'lucide-react';
import type { Quiz, QuizSession } from '../../types';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, ease } from '../../theme/motion';
import ResultProgress from './ResultProgress';
import ResultMetrics from './ResultMetrics';

interface ResultHeroProps {
  quiz: Quiz;
  session: QuizSession;
  sessions: QuizSession[];
  pct: number;
  grade: { label: string; Icon: LucideIcon; color: string };
  duration: number;
  formatTime: (seconds: number) => string;
  wrongCount: number;
  /** Întrebări nevăzute sau lăsate goale: nu se numără ca greșite. */
  unansweredCount?: number;
  disciplineResults: { discipline: string; correct: number; total: number; percent: number; unanswered?: number }[];
}

export default function ResultHero({ quiz, session, sessions, pct, grade, duration, formatTime, wrongCount, unansweredCount = 0, disciplineResults }: ResultHeroProps) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  return (
    <motion.div initial={calmMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}
      transition={t.hero} style={{ background: 'linear-gradient(145deg, var(--accent-soft), transparent 60%), var(--glass-panel-strong)' }} className="glass-panel text-center mb-8 overflow-hidden rounded-[var(--r-xl)] px-5 sm:px-6 py-7 sm:py-8">

      <div
        className="h-[72px] mb-4 flex items-center justify-center" style={{ color: grade.color }}>
        <grade.Icon size={64} strokeWidth={1.5} />
      </div>

      <div className="secondary-label mb-2 font-black tracking-[0.22em]" style={{ color: theme.text3 }}>
        RAPORT SESIUNE
      </div>
      <h1 className="page-title-compact mb-2" style={{ color: theme.text }}>{grade.label}</h1>
      <p className="mb-6" style={{ color: theme.text2 }}>{quiz.title}</p>

      {/* Score ring */}
      <div className="relative w-32 h-32 sm:w-36 sm:h-36 mx-auto mb-6">
        <svg aria-hidden="true" className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke={theme.surface2} strokeWidth="8" />
          <motion.circle cx="50" cy="50" r="42" fill="none"
            stroke={grade.color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            initial={calmMotion ? false : { strokeDashoffset: 2 * Math.PI * 42 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - pct / 100) }}
            transition={calmMotion ? { duration: 0 } : { duration: dur.slow, ease: ease.emphasized }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="metric-value" style={{ color: theme.text }}>{pct}%</span>
          <span className="text-xs" style={{ color: theme.text3 }}>scor</span>
        </div>
      </div>

      <ResultMetrics session={session} durationLabel={formatTime(duration)} unansweredCount={unansweredCount} />

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
          {plural(wrongCount, 'greșeală', 'greșeli')} de revizuit
        </span>
        {unansweredCount > 0 && (
          <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
            {unansweredCount} fără răspuns
          </span>
        )}
        {session.partialAnswers && session.partialAnswers.length > 0 && (
          <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.warning }}>
            {plural(session.partialAnswers.length, 'parțială', 'parțiale')} — necesită consolidare
          </span>
        )}
        <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
          {formatTime(duration)} durată
        </span>
        <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
          {plural(quiz.questions.length, 'întrebare', 'întrebări')} în set
        </span>
      </div>

      <ResultProgress session={session} sessions={sessions} penaltyMode={!!quiz.penaltyMode} />

      {disciplineResults.length > 0 && (
        <section className="glass-panel mb-6 rounded-[var(--r-lg)] p-5" aria-label="Rezultat pe discipline">
          <h2 className="mb-3 text-[13px] font-semibold" style={{ color: theme.text }}>Rezultat pe discipline (cele mai slabe întâi)</h2>
          <ul className="space-y-2">
            {disciplineResults.map((row) => (
              <li key={row.discipline} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate" style={{ color: theme.text2 }}>{row.discipline}</span>
                <span className="tabular-nums" style={{ color: theme.text3 }}>{row.correct}/{row.total}{row.unanswered ? ` · ${row.unanswered} fără răspuns` : ''}</span>
                <span className="w-12 text-right font-semibold tabular-nums" style={{ color: row.percent >= 75 ? theme.success : row.percent >= 50 ? theme.warning : theme.danger }}>{row.percent}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Rezidențiat penalty score panel */}
      {session.penalizedScore !== undefined && quiz.penaltyMode && (
        <motion.div
          initial={calmMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={t.page}
          className="mt-5 mx-auto"
          style={{
            maxWidth: 320,
            background: `${theme.danger}14`,
            border: `1px solid ${theme.danger}40`,
            borderRadius: 14,
            padding: '14px 20px',
          }}>
          <div className="flex items-center gap-2 mb-1" style={{ color: theme.danger }}>
            <Scale size={14} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Scor net Rezidențiat
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: theme.danger, lineHeight: 1 }}>
            {session.penalizedScore}
            <span style={{ fontSize: 16, fontWeight: 500, color: `${theme.danger}99`, marginLeft: 4 }}>
              / {session.total} pct
            </span>
          </div>
          <div style={{ fontSize: 12, color: theme.text2, marginTop: 6 }}>
            {session.total > 0 ? Math.round((session.penalizedScore / session.total) * 100) : 0}% din punctajul maxim ·{' '}
            <span style={{ color: theme.text3 }}>+1 corect · −0.25/greșit</span>
          </div>
        </motion.div>
      )}
    </motion.div>

  );
}
