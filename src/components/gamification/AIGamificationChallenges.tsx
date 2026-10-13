import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProgressBar from '../fx/ProgressBar';
import { useTheme } from '../../theme/ThemeContext';
import type { Theme } from '../../theme/themes';
import {
  CHALLENGE_KIND_LABELS,
  DIFFICULTY_LABELS,
  UNIT_LABELS,
  type Challenge,
  type Difficulty,
} from './gamificationCatalog';

interface AIGamificationChallengesProps {
  challenges: Challenge[];
}

function difficultyColor(theme: Theme, difficulty: Difficulty): string {
  switch (difficulty) {
    case 'easy': return theme.success;
    case 'medium': return theme.accent;
    case 'hard': return theme.warning;
    default: return theme.danger;
  }
}

export default function AIGamificationChallenges({ challenges }: AIGamificationChallengesProps) {
  const theme = useTheme();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {challenges.map((challenge, index) => {
        const Icon = challenge.icon;
        const color = difficultyColor(theme, challenge.difficulty);
        return (
          <article
            key={challenge.id}
            className="glass-panel fx-lift fx-spot fx-rise flex flex-col rounded-2xl p-4"
            style={{ '--i': index } as CSSProperties}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
                style={challenge.done ? { background: theme.accent, color: '#fff' } : { background: 'var(--accent-soft)', color: theme.accentText }}
                aria-hidden="true"
              >
                {challenge.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold leading-snug" style={{ color: theme.text }}>{challenge.title}</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="fine-chip inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: theme.text2 }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
                    {DIFFICULTY_LABELS[challenge.difficulty]}
                  </span>
                  <span className="fine-chip rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: theme.text3 }}>
                    {CHALLENGE_KIND_LABELS[challenge.kind]}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: theme.text3 }}>{challenge.description}</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: theme.text3, opacity: 0.85 }}>{challenge.how}</p>

            <div className="mt-4">
              <ProgressBar percent={challenge.percent} color={challenge.done ? theme.success : theme.accent} delay={index * 0.04} label={challenge.title} />
              <div className="mt-1.5 flex items-center justify-between text-[11.5px] tabular-nums" style={{ color: theme.text3 }}>
                <span>{challenge.percent}%</span>
                <span className="font-medium" style={{ color: theme.text2 }}>
                  {challenge.current}/{challenge.target} {UNIT_LABELS[challenge.unit]}
                </span>
              </div>
            </div>

            {challenge.done ? (
              <div className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: theme.success }}>
                <Check className="h-4 w-4" aria-hidden="true" />
                Îndeplinită
              </div>
            ) : (
              <Link
                to={challenge.to}
                className="fine-chip mt-4 inline-flex items-center justify-center self-start rounded-full px-3.5 py-1.5 text-[12.5px] font-medium"
                style={{ color: theme.accentText }}
              >
                Începe provocarea
              </Link>
            )}
          </article>
        );
      })}
    </div>
  );
}
