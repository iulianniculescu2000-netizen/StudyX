import { Check, Circle, Minus, X } from 'lucide-react';
import type { Option } from '../../../types';
import type { Theme } from '../../../theme/themes';
import { dur } from '../../../theme/motion';
import { getFocusTokens, type QuizPlayLayout } from '../layout';

interface OptionListProps {
  options: Option[];
  correctIds: string[];
  selectedNow: string[];
  revealed: boolean;
  isMultiple: boolean;
  /** Revealed answer was partially right: missed correct options get an amber dashed outline. */
  wasPartial: boolean;
  shakeId: string | null;
  theme: Theme;
  layout: QuizPlayLayout;
  focusMode: boolean;
  calmMotion: boolean;
  onSelect: (optionId: string) => void;
}

export default function OptionList({
  options, correctIds, selectedNow, revealed, isMultiple, wasPartial, theme, layout, focusMode, calmMotion, onSelect,
}: OptionListProps) {
  const focus = getFocusTokens(theme, focusMode);

  const getOptionStyle = (optId: string): React.CSSProperties => {
    const isSelected = selectedNow.includes(optId);
    const isCorrect = correctIds.includes(optId);
    if (!revealed) {
      if (isSelected) return {
        background: `${theme.accent}25`,
        border: `2px solid ${theme.accent}`,
        boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
      };
      return {
        background: focus.surface,
        border: `2px solid ${focus.border}`,
      };
    }
    // Partial correct: selected correct options → green; missed correct → warning amber
    if (isCorrect && !isSelected && wasPartial) return {
      background: `${theme.warning}10`,
      border: `2px dashed ${theme.warning}`,
    };
    if (isCorrect) return {
      background: `${theme.success}12`,
      border: `2px solid ${theme.success}`,
    };
    if (isSelected) return {
      background: `${theme.danger}12`,
      border: `2px solid ${theme.danger}`,
    };
    return {
      background: focusMode ? focus.surface2 : theme.surface,
      border: `2px solid ${focusMode ? focus.border : theme.border}`,
      opacity: focusMode ? 0.68 : 0.4,
    };
  };

  const getOptionTextColor = (optId: string) => {
    if (!revealed) return theme.text;
    const isCorrectOpt = correctIds.includes(optId);
    const isSelected = selectedNow.includes(optId);
    if (isCorrectOpt && !isSelected && wasPartial) return theme.warning;
    if (isCorrectOpt) return theme.success;
    if (isSelected) return theme.danger;
    return theme.text3;
  };

  return (
    <div className={layout.optionStackClass}>
      {options.map((opt: Option, i: number) => (
        <button key={opt.id}
          aria-pressed={selectedNow.includes(opt.id)}
          onClick={() => onSelect(opt.id)}
          disabled={revealed && !isMultiple}
          className={`premium-option-card focus-ring relative w-full flex items-center gap-4 rounded-[var(--r-lg)] text-left transition-[background-color,border-color,color,opacity] ${layout.optionPaddingClass}`}
          style={{ ...getOptionStyle(opt.id), transitionDuration: calmMotion ? '0s' : `${dur.fast}s` }}
        >
          {/* Checkbox/Radio */}
          <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border-2 transition-[background-color,border-color,color,opacity]"
            style={{
              transitionDuration: calmMotion ? '0s' : `${dur.fast}s`,
              borderColor: revealed && wasPartial && correctIds.includes(opt.id) && !selectedNow.includes(opt.id) ? theme.warning : (revealed && correctIds.includes(opt.id)) ? theme.success : (selectedNow.includes(opt.id) ? (revealed ? theme.danger : theme.accent) : theme.border2),
              background: revealed && wasPartial && correctIds.includes(opt.id) && !selectedNow.includes(opt.id) ? `${theme.warning}20` : (revealed && correctIds.includes(opt.id)) ? `${theme.success}20` : (selectedNow.includes(opt.id) ? (revealed ? `${theme.danger}20` : `${theme.accent}20`) : 'transparent'),
              color: getOptionTextColor(opt.id),
            }}>
            {revealed
              ? (correctIds.includes(opt.id)
                  ? (wasPartial && !selectedNow.includes(opt.id)
                      ? <Minus size={15} aria-hidden="true" />
                      : <Check size={15} aria-hidden="true" />)
                  : selectedNow.includes(opt.id) ? <X size={15} aria-hidden="true" /> : String.fromCharCode(65 + i))
              : selectedNow.includes(opt.id)
                ? (isMultiple ? <Check size={15} aria-hidden="true" /> : <Circle size={12} fill="currentColor" aria-hidden="true" />)
                : String.fromCharCode(65 + i)}

          </div>
          <span className={layout.optionTextClass} style={{ color: getOptionTextColor(opt.id) }}>
            {opt.text}
          </span>
          {revealed && (correctIds.includes(opt.id) || selectedNow.includes(opt.id)) && (
            <span className="sr-only">
              {correctIds.includes(opt.id)
                ? (wasPartial && !selectedNow.includes(opt.id) ? 'Răspuns corect omis' : 'Răspuns corect')
                : 'Răspuns incorect'}
            </span>
          )}
          {/* Keyboard hint badge */}
          {!layout.denseLayout && (
            <span aria-hidden="true" className="ml-auto text-xs font-mono rounded px-1.5 py-0.5 flex-shrink-0"
              style={{ background: theme.surface2, color: theme.text3, visibility: revealed ? 'hidden' : undefined }}>
              {i + 1}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
