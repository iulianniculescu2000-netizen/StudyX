import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { QuizSession } from '../../types';
import { useTheme } from '../../theme/ThemeContext';

/** Compare only completed attempts of the same set, mode and answered question IDs. */
function previousComparableSession(session: QuizSession, sessions: QuizSession[], penaltyMode: boolean) {
  if (penaltyMode || session.penalizedScore !== undefined || !session.finishedAt || session.total <= 0) return undefined;
  if (!Number.isFinite(session.score) || session.score < 0 || session.score > session.total) return undefined;
  const questionIds = Object.keys(session.answers).sort();
  if (questionIds.length !== session.total) return undefined;
  return sessions.filter((candidate) => {
    const candidateIds = Object.keys(candidate.answers).sort();
    return candidate.id !== session.id
      && candidate.quizId === session.quizId
      && candidate.mode === session.mode
      && candidate.total === session.total
      && Number.isFinite(candidate.score) && candidate.score >= 0 && candidate.score <= candidate.total
      && candidate.penalizedScore === undefined
      && candidate.finishedAt !== undefined
      && candidate.finishedAt <= session.startedAt
      && candidateIds.length === questionIds.length
      && candidateIds.every((id, index) => id === questionIds[index]);
  }).sort((left, right) => right.finishedAt! - left.finishedAt!)[0];
}

export default function ResultProgress({ session, sessions, penaltyMode }: {
  session: QuizSession; sessions: QuizSession[]; penaltyMode: boolean;
}) {
  const theme = useTheme();
  const previous = previousComparableSession(session, sessions, penaltyMode);
  if (!previous) return null;
  const currentPct = Math.round(session.score / session.total * 100);
  const previousPct = Math.round(previous.score / previous.total * 100);
  const delta = currentPct - previousPct;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <div className="mx-auto mt-5 flex max-w-sm items-center gap-3 rounded-[var(--r-lg)] px-4 py-3 text-left"
      style={{ background: 'var(--fill-subtle)', border: '1px solid var(--hairline)' }}>
      <Icon size={22} aria-hidden="true" style={{ color: delta > 0 ? theme.success : theme.text2 }} />
      <div className="min-w-0">
        <p className="text-sm font-semibold tabular-nums" style={{ color: theme.text }}>
          {delta === 0 ? 'Același scor' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} puncte procentuale`}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: theme.text3 }}>
          Față de sesiunea anterioară pe aceleași întrebări · {previousPct}% → {currentPct}%
        </p>
      </div>
    </div>
  );
}
