import { AnimatePresence, motion } from 'framer-motion';
import { Check, Eye, ImagePlus, Layers, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Question } from '../../types';
import type { Theme } from '../../theme/themes';
import { DIFFICULTIES, OPTION_IDS } from './helpers';
import { Label, Panel } from './ui';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';

interface QuizQuestionEditorProps {
  activeQ: number;
  canRemoveQuestion: boolean;
  currentQ: Question;
  theme: Theme;
  onAddOption: () => void;
  onImageUpload: () => void;
  onOptionRemove: (optionId: string) => void;
  onOptionTextChange: (optionId: string, value: string) => void;
  onPreview: () => void;
  onQuestionRemove: () => void;
  onQuestionTextChange: (value: string) => void;
  onRemoveImage: () => void;
  onSetDifficulty: (difficulty: Question['difficulty']) => void;
  onToggleCorrect: (optionId: string) => void;
  onToggleMultiple: () => void;
  onExplanationChange: (value: string) => void;
}

export function QuizQuestionEditor({
  activeQ,
  canRemoveQuestion,
  currentQ,
  theme,
  onAddOption,
  onExplanationChange,
  onImageUpload,
  onOptionRemove,
  onOptionTextChange,
  onPreview,
  onQuestionRemove,
  onQuestionTextChange,
  onRemoveImage,
  onSetDifficulty,
  onToggleCorrect,
  onToggleMultiple,
}: QuizQuestionEditorProps) {
  const { t } = useAdaptiveMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentQ.id}
        data-tutorial="create-question-editor"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={t.pop}
        className="space-y-4 pb-2"
      >
        <Panel theme={theme}>
          <div className="flex items-center justify-between mb-2">
            <Label theme={theme}>Întrebarea {activeQ + 1}</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={onPreview}
                className="fine-chip press-feedback flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                style={{ color: theme.text3 }}
              >
                <Eye size={11} />
                Previzualizare
              </button>
              <button
                onClick={onToggleMultiple}
                className="fine-chip press-feedback flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                data-active={!!currentQ.multipleCorrect}
                aria-pressed={!!currentQ.multipleCorrect}
                style={{ color: currentQ.multipleCorrect ? undefined : theme.text3 }}
              >
                <Layers size={11} />
                Multi
              </button>
              {canRemoveQuestion && (
                <button
                  onClick={onQuestionRemove}
                  aria-label="Șterge întrebarea"
                  className="fine-row press-feedback p-1"
                  style={{ color: theme.danger }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <textarea
            placeholder="Scrie întrebarea ta..."
            value={currentQ.text}
            onChange={(event) => onQuestionTextChange(event.target.value)}
            rows={3}
            className="input-bare w-full resize-none font-medium"
            style={{ color: theme.text, outline: 'none', border: 'none' }}
          />

          {currentQ.imageUrl ? (
            <div className="relative mt-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
              <img
                src={currentQ.imageUrl}
                alt="Question"
                className="block w-full max-h-72 object-contain"
                style={{ background: theme.surface2 }}
              />
              <button
                onClick={onRemoveImage}
                aria-label="Elimină imaginea"
                className="absolute top-2 right-2 p-1.5 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={onImageUpload}
              className="fine-chip press-feedback mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{ color: theme.text3, borderStyle: 'dashed', borderColor: theme.border2 }}
            >
              <ImagePlus size={14} />
              Adaugă imagine opțională
            </button>
          )}

          <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
            {DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty.id}
                onClick={() => onSetDifficulty(difficulty.id)}
                className="flex-1 py-1 rounded-lg text-xs font-medium transition-[background-color,border-color,color,opacity,transform]"
                style={{
                  background: currentQ.difficulty === difficulty.id ? `${difficulty.color}20` : theme.surface2,
                  color: currentQ.difficulty === difficulty.id ? difficulty.color : theme.text3,
                  border: `1px solid ${currentQ.difficulty === difficulty.id ? `${difficulty.color}40` : 'transparent'}`,
                }}
              >
                {difficulty.label}
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-2">
          <p className="text-xs px-1" style={{ color: theme.text3 }}>
            <Sparkles size={11} className="inline mr-1" />
            {currentQ.multipleCorrect
              ? 'Apasă pe cerc pentru a marca toate răspunsurile corecte.'
              : 'Apasă pe cerc pentru a marca răspunsul corect.'}
          </p>
          {currentQ.options.map((option, index) => (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-3 p-4 rounded-2xl transition-[background-color,border-color,color,opacity,transform] group"
              style={{
                background: option.isCorrect ? `${theme.success}10` : theme.surface,
                border: `1px solid ${option.isCorrect ? `${theme.success}30` : theme.border}`,
              }}
            >
              <button
                onClick={() => onToggleCorrect(option.id)}
                aria-label={`Marchează opțiunea ${option.id.toUpperCase()} ca fiind corectă`}
                aria-pressed={option.isCorrect}
                className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-[background-color,border-color,color,opacity,transform]"
                style={{
                  borderColor: option.isCorrect ? theme.success : theme.border2,
                  background: option.isCorrect ? theme.success : 'transparent',
                }}
              >
                {option.isCorrect && <Check size={12} className="text-white" />}
              </button>
              <span className="text-xs font-bold" style={{ color: theme.text3, minWidth: 16 }}>
                {option.id.toUpperCase()}
              </span>
              <input
                type="text"
                placeholder={`Opțiunea ${option.id.toUpperCase()}...`}
                value={option.text}
                onChange={(event) => onOptionTextChange(option.id, event.target.value)}
                className="input-bare min-w-0 flex-1 text-sm"
                style={{ color: theme.text, outline: 'none', border: 'none' }}
              />
              {currentQ.options.length > 2 && (
                <button
                  onClick={() => onOptionRemove(option.id)}
                  aria-label={`Șterge opțiunea ${option.id.toUpperCase()}`}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-[background-color,border-color,color,opacity,transform]"
                  style={{ color: theme.danger }}
                >
                  <X size={13} />
                </button>
              )}
            </motion.div>
          ))}

          {currentQ.options.length < OPTION_IDS.length && (
            <button
              onClick={onAddOption}
              className="fine-chip press-feedback w-full py-2.5 rounded-2xl text-sm flex items-center justify-center gap-1.5"
              style={{ color: theme.text3, borderStyle: 'dashed', borderColor: theme.border2 }}
            >
              <Plus size={13} />
              Adaugă opțiune
            </button>
          )}
        </div>

        <Panel theme={theme}>
          <Label theme={theme}>Explicație opțională</Label>
          <input
            type="text"
            placeholder="Explică de ce răspunsul este corect..."
            value={currentQ.explanation || ''}
            onChange={(event) => onExplanationChange(event.target.value)}
            className="input-bare mt-1 w-full text-sm"
            style={{ color: theme.text, outline: 'none', border: 'none' }}
          />
        </Panel>
      </motion.div>
    </AnimatePresence>
  );
}
