import type { Theme } from '../../../theme/themes';
import { formatQuizPlayTime } from '../helpers';
import HelpTip from '../../../components/ui/HelpTip';

interface MetricsStripProps {
  theme: Theme;
  mobile: boolean;
  category: string;
  timedMode: boolean;
  examMinutes: number;
  examSecondsLeft: number;
  timeElapsed: number;
  questionTimer: number;
  autoAdvance: boolean;
  answeredCount: number;
  total: number;
}

/**
 * Compact session metrics. Desktop shows four boxes; mobile gets a single-row summary instead:
 * the 4-box grid is desktop-width-shaped and repeats "Întrebarea X din Y" already shown above it.
 */
export default function MetricsStrip({
  theme, mobile, category, timedMode, examMinutes, examSecondsLeft, timeElapsed, questionTimer, autoAdvance, answeredCount, total,
}: MetricsStripProps) {
  const timerTone = questionTimer <= 10 ? theme.danger : timedMode ? theme.warning : theme.accent;

  if (mobile) {
    return (
    <div
      className="flex shrink-0 items-center justify-between gap-2 self-start rounded-[var(--r-md)] border border-white/18 px-3.5 py-2.5"
      style={{ background: 'rgba(255,255,255,0.12)' }}
    >
      <span className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-white/75">
        {category}
      </span>
      {timedMode && (
        <span
          className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums"
          style={{ background: 'rgba(255,255,255,0.18)', color: timerTone === theme.danger ? '#FFD1CE' : '#FFFFFF' }}
        >
          {questionTimer}s
        </span>
      )}
    </div>
    );
  }

  return (
    <div
      className="flex shrink-0 self-start items-stretch divide-x rounded-[var(--r-lg)] overflow-hidden border border-white/18"
      style={{ background: 'rgba(255,255,255,0.12)' }}
    >
      {[
        { label: 'Progres', value: `${answeredCount}/${total}` },
        { label: examMinutes ? 'Timp rămas' : 'Timp', value: formatQuizPlayTime(examMinutes ? examSecondsLeft : timeElapsed), accent: examMinutes && examSecondsLeft <= 300 ? theme.danger : undefined },
        { label: timedMode ? 'Timer' : 'Ritm', value: timedMode ? `${questionTimer}s` : autoAdvance ? 'Auto' : 'Man.' , accent: timedMode ? timerTone : undefined },
        { label: 'Rămase', value: `${Math.max(total - answeredCount, 0)}` },
      ].map((metric, i) => (
        <div
          key={metric.label}
          className="flex flex-col items-center justify-center px-4 py-3 gap-1"
          style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.16)' : 'none' }}
        >
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/50 whitespace-nowrap leading-none">
            {metric.label}
            {metric.label === 'Ritm' && <HelpTip id="quiz-rhythm" size={14} tone="onDark" />}
          </span>
          <span
            className="text-sm font-black tracking-tight whitespace-nowrap leading-none"
            style={{ color: metric.accent ?? 'rgba(255,255,255,0.95)' }}
          >
            {metric.value}
          </span>
        </div>
      ))}
    </div>
  );
}
