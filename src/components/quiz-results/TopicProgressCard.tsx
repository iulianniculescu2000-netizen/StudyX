import { TrendingDown, TrendingUp } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import type { MasteryDelta } from '../../lib/topicMasteryDelta';

/** Sfârșit de sesiune de exersare: cât s-a mișcat stăpânirea subiectului, în cifre și pe o bară. */
export default function TopicProgressCard({ delta }: { delta: MasteryDelta }) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const { topic, before, after } = delta;
  const diff = before === null ? null : after - before;
  const up = diff === null || diff >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const tone = up ? theme.success : theme.warning;
  const sentence = diff === null
    ? 'Prima măsurare pe acest subiect.'
    : diff === 0 ? 'Neschimbat față de începutul sesiunii.'
      : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} puncte față de începutul sesiunii.`;

  return (
    <section aria-label={`Progres la ${topic}`} className="glass-panel mb-6 rounded-[var(--r-lg)] px-4 py-4 sm:px-5" style={{ background: 'var(--glass-panel-strong)' }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${tone}18`, color: tone }}>
          <Icon size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>Stăpânirea subiectului</div>
          <div className="break-words text-[15px] font-semibold leading-snug" style={{ color: theme.text }}>{topic}</div>
        </div>
        <div className="flex-shrink-0 text-right tabular-nums" style={{ color: theme.text }}>
          <span className="text-[13px]" style={{ color: theme.text3 }}>{before === null ? '' : `${before}% → `}</span>
          <span className="text-[20px] font-semibold">{after}%</span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: theme.fillSubtle }} role="img" aria-label={`Stăpânire ${after}%`}>
        <div className="h-full rounded-full" style={{ width: `${after}%`, background: tone, transition: calmMotion ? undefined : 'width 700ms var(--ease-out, ease-out)' }} />
      </div>
      <div className="mt-2 text-[12px]" style={{ color: theme.text3 }}>{sentence}</div>
    </section>
  );
}
