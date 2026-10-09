import { motion } from 'framer-motion';
import type { Option } from '../../../types';
import type { Theme } from '../../../theme/themes';
import { dur, ease, press, staggerStep, staggerMax } from '../../../theme/motion';
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
  options, correctIds, selectedNow, revealed, isMultiple, wasPartial, shakeId, theme, layout, focusMode, calmMotion, onSelect,
}: OptionListProps) {
  const focus = getFocusTokens(theme, focusMode);

  const getOptionStyle = (optId: string): React.CSSProperties => {
    const isSelected = selectedNow.includes(optId);
    const isCorrect = correctIds.includes(optId);
    if (!revealed) {
      if (isSelected) return {
        background: `${theme.accent}25`,
        border: `2px solid ${theme.accent}`,
        transform: 'translateY(-1px)',
      };
      return {
        background: focus.surface,
        border: `${focusMode ? '1.5px' : '1px'} solid ${focus.border}`,
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
      border: `1px solid ${focusMode ? focus.border : theme.border}`,
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
        <motion.button key={opt.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: 1,
            y: 0,
            x: shakeId === opt.id && !calmMotion ? [0, -10, 10, -8, 8, -4, 4, 0] : 0,
            scale: (revealed && correctIds.includes(opt.id) && !calmMotion) ? [1, 1.02, 1] : 1
          }}
          transition={{
            duration: calmMotion ? dur.instant : shakeId === opt.id ? dur.base : revealed && correctIds.includes(opt.id) ? dur.slow : dur.fast,
            delay: calmMotion ? 0 : Math.min(i, staggerMax) * staggerStep,
            ease: ease.standard,
          }}
          onClick={() => onSelect(opt.id)}
          disabled={revealed && !isMultiple}
          className={`premium-option-card focus-ring w-full flex items-center gap-4 rounded-[var(--r-lg)] text-left transition-[background-color,border-color,color,opacity] ${layout.optionPaddingClass}`}
          style={getOptionStyle(opt.id)}
          // Răspunsul e cel mai repetat click din aplicație: apăsare standard (.97), fără scalare la hover.
          whileTap={!revealed && !calmMotion ? press.whileTap : undefined}
        >
          {/* Checkbox/Radio */}
          <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border-2 transition-[background-color,border-color,color,opacity,transform]"
            style={{
              borderColor: (revealed && correctIds.includes(opt.id)) ? theme.success : (selectedNow.includes(opt.id) ? (revealed ? theme.danger : theme.accent) : theme.border2),
              background: (revealed && correctIds.includes(opt.id)) ? `${theme.success}20` : (selectedNow.includes(opt.id) ? (revealed ? `${theme.danger}20` : `${theme.accent}20`) : 'transparent'),
              color: getOptionTextColor(opt.id),
            }}>
            {revealed && correctIds.includes(opt.id) 
              ? '\u2713' 
              : (selectedNow.includes(opt.id) 
                  ? (revealed ? '\u00D7' : (isMultiple ? '\u25CF' : String.fromCharCode(65 + i))) 
                  : String.fromCharCode(65 + i))}
          </div>
          <span className={layout.optionTextClass} style={{ color: getOptionTextColor(opt.id) }}>
            {opt.text}
          </span>
          {/* Keyboard hint badge */}
          {!revealed && !layout.denseLayout && (
            <span className="ml-auto text-xs font-mono rounded px-1.5 py-0.5 flex-shrink-0"
              style={{ background: theme.surface2, color: theme.text3 }}>
              {i + 1}
            </span>
          )}
        </motion.button>
      ))}
    </div>
  );
}
