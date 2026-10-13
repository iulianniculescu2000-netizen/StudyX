import type { QuizSession } from '../../types';
import { useTheme } from '../../theme/ThemeContext';

export default function ResultMetrics({ session, durationLabel, unansweredCount = 0 }: { session: QuizSession; durationLabel: string; unansweredCount?: number }) {
  const theme = useTheme();
  const partialCount = session.partialAnswers?.length ?? 0;
  const metrics = [
    { value: session.score, label: 'Corecte', color: theme.success },
    ...(partialCount > 0 ? [{ value: partialCount, label: 'Parțiale', color: theme.warning }] : []),
    { value: Math.max(0, session.total - session.score - partialCount - unansweredCount), label: 'Greșite', color: theme.danger },
    ...(unansweredCount > 0 ? [{ value: unansweredCount, label: 'Fără răspuns', color: theme.text3 }] : []),
    { value: durationLabel, label: 'Timp', color: theme.text },
  ];
  return (
    <dl className={`mx-auto grid max-w-lg gap-x-4 gap-y-4 border-y border-[var(--hairline)] py-4 ${partialCount > 0 || unansweredCount > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
      {metrics.map((metric) => (
        <div key={metric.label} className="flex min-w-0 flex-col-reverse gap-1 text-center">
          <dt className="micro-copy" style={{ color: theme.text3 }}>{metric.label}</dt>
          <dd className="section-title tabular-nums" style={{ color: metric.color }}>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}
