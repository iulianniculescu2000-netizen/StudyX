import { Layers } from 'lucide-react';
import type { Question } from '../../../types';
import type { Theme } from '../../../theme/themes';
import QuizImage from '../../../components/QuizImage';
import { getFocusTokens, type QuizPlayLayout } from '../layout';

const DIFFICULTY_LABEL = { easy: 'Ușor', medium: 'Mediu', hard: 'Dificil' } as const;

interface QuestionCardProps {
  question: Question;
  theme: Theme;
  layout: QuizPlayLayout;
  focusMode: boolean;
  modeLabel: string;
  currentIdx: number;
  total: number;
  isMultiple: boolean;
  revealed: boolean;
}

/** The question prompt: mode label, tags, text, optional image and multi-select hint. */
export default function QuestionCard({ question, theme, layout, focusMode, modeLabel, currentIdx, total, isMultiple, revealed }: QuestionCardProps) {
  const focus = getFocusTokens(theme, focusMode);
  const difficultyColor = { easy: theme.success, medium: theme.warning, hard: theme.danger };
  return (
    <div
      className={`editorial-hero rounded-[var(--r-xl)] mb-5 ${layout.questionCardPaddingClass}`}
      style={{
        background: focus.questionCardSurface,
        border: `1px solid ${focus.border}`,
        boxShadow: focusMode ? `inset 0 1px 0 var(--glass-highlight), ${focus.panelShadow}` : undefined,
      }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: theme.accentText }}>
          {modeLabel}
        </span>
        {isMultiple && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${theme.accent2}18`, color: theme.accent2 }}>
            <Layers size={10} />Multi-select
          </span>
        )}
        {question.difficulty && (
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${difficultyColor[question.difficulty]}18`, color: difficultyColor[question.difficulty] }}>
            {DIFFICULTY_LABEL[question.difficulty]}
          </span>
        )}
      </div>
      <p className="text-xs font-black uppercase tracking-[0.22em] mb-2" style={{ color: theme.text3 }}>
        Întrebarea {currentIdx + 1} din {total}
      </p>
      <p className={layout.questionTextClass} style={{ color: theme.text }}>{question.text}</p>

      {/* Question image */}
      {question.imageUrl && (
        <div className="mt-4">
          <QuizImage src={question.imageUrl} maxHeight={layout.questionImageMaxHeight} />
        </div>
      )}

      {isMultiple && !revealed && (
        <p className="text-sm mt-2" style={{ color: theme.text3 }}>
          Selectează toate răspunsurile corecte, apoi apasă "Confirmă"
        </p>
      )}
    </div>
  );
}
