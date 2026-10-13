import ProgressBar from '../../components/fx/ProgressBar';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Check, FileText, ListChecks, Loader2, Sparkles, Stethoscope } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import {
  ALL_QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  previewDistribution,
  type QuestionType,
} from '../../lib/ai/questionTypes';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, ease } from '../../theme/motion';
import HelpTip from '../../components/ui/HelpTip';

interface QuizAIGenerationPanelProps {
  aiCount: number;
  aiDifficulty: number;
  aiError: string;
  aiLoading: boolean;
  aiMode: 'standard' | 'clinical';
  aiQuestionTypes: QuestionType[];
  aiProgress: { generated: number; total: number } | null;
  aiText: string;
  hasKey: boolean;
  theme: Theme;
  visible: boolean;
  onCountChange: (count: number) => void;
  onDifficultyChange: (d: number) => void;
  onQuestionTypesChange: (types: QuestionType[]) => void;
  onGenerate: () => void;
  onImportPdf: () => void;
  onModeChange: (mode: 'standard' | 'clinical') => void;
  onTextChange: (value: string) => void;
}

export function QuizAIGenerationPanel({
  aiCount,
  aiDifficulty,
  aiError,
  aiLoading,
  aiMode,
  aiQuestionTypes,
  aiProgress,
  aiText,
  hasKey,
  theme,
  visible,
  onCountChange,
  onDifficultyChange,
  onQuestionTypesChange,
  onGenerate,
  onImportPdf,
  onModeChange,
  onTextChange,
}: QuizAIGenerationPanelProps) {
  const { t } = useAdaptiveMotion();
  const toggleQuestionType = (type: QuestionType) => {
    const has = aiQuestionTypes.includes(type);
    // Keep at least one type selected.
    if (has && aiQuestionTypes.length === 1) return;
    onQuestionTypesChange(
      has ? aiQuestionTypes.filter((t) => t !== type) : [...aiQuestionTypes, type],
    );
  };
  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="ai-panel"
          data-tutorial="create-ai-panel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={t.pop}
          className="mb-4 rounded-2xl p-5 space-y-4"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: theme.accent }}
            >
              <Bot size={15} className="text-white" />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: theme.text }}>Generator AI de grile <HelpTip id="create-ai" size={16} /></p>
              <p className="text-xs" style={{ color: theme.text3 }}>
                Lipește text medical, iar AI-ul generează întrebări structurate.
              </p>
            </div>
          </div>

          {!hasKey && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl text-sm"
              style={{ background: `${theme.warning}12`, border: `1px solid ${theme.warning}30`, color: theme.warning }}
            >
              Adaugă o cheie AI în Setări › Inteligență artificială (există chei gratuite), apoi revino aici.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: theme.text2 }}>
                Text sursă
              </label>
              {window.electronAPI?.openPdfFile && (
                <button
                  onClick={onImportPdf}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                  style={{ background: theme.surface2, color: theme.accentText, border: `1px solid ${theme.accent}30` }}
                >
                  <FileText size={11} />
                  Import PDF
                </button>
              )}
            </div>
            <textarea
              value={aiText}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="Lipește sau scrie textul din care vrei să generezi grile..."
              rows={7}
              className="w-full text-sm px-3 py-2.5 rounded-xl resize-none"
              style={{
                background: theme.surface2,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                outline: 'none',
              }}
            />
          </div>

          {/* Mode: Grile standard / Cazuri clinice */}
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: theme.text2 }}>
              Tip întrebări
            </label>
            <div className="flex gap-2">
              {([
                { id: 'standard', label: 'Grile standard', Icon: ListChecks },
                { id: 'clinical', label: 'Cazuri clinice', Icon: Stethoscope },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  onClick={() => onModeChange(m.id)}
                  className="flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-[background-color,border-color,color,opacity,transform] flex items-center justify-center gap-1.5"
                  style={{
                    background: aiMode === m.id ? theme.accent : theme.surface2,
                    color: aiMode === m.id ? '#fff' : theme.text3,
                    border: `1px solid ${aiMode === m.id ? `${theme.accent}50` : 'transparent'}`,
                  }}
                >
                  <m.Icon size={15} aria-hidden="true" />{m.label}
                </button>
              ))}
            </div>
            {aiMode === 'clinical' && (
              <p className="text-xs mt-1.5 px-1" style={{ color: theme.text3 }}>
                Cazurile clinice includ istoricul pacientului + întrebarea diagnostică.
              </p>
            )}
          </div>

          {/* Difficulty */}
          {aiMode === 'standard' && (
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: theme.text2 }}>
                Dificultate
              </label>
              <div className="flex gap-2">
                {([
                  { level: 1, label: 'Ușor' },
                  { level: 2, label: 'Mediu' },
                  { level: 3, label: 'Dificil' },
                  { level: 4, label: 'Expert' },
                ]).map((d) => (
                  <button
                    key={d.level}
                    onClick={() => onDifficultyChange(d.level)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition-[background-color,border-color,color,opacity,transform]"
                    style={{
                      background: aiDifficulty === d.level ? theme.accent : theme.surface2,
                      color: aiDifficulty === d.level ? '#fff' : theme.text3,
                      border: `1px solid ${aiDifficulty === d.level ? `${theme.accent}50` : 'transparent'}`,
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question type router (standard mode only) */}
          {aiMode === 'standard' && (
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: theme.text2 }}>
                Tipuri de întrebări
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_QUESTION_TYPES.map((type) => {
                  const active = aiQuestionTypes.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleQuestionType(type)}
                      className="flex items-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-[background-color,border-color,color,opacity,transform]"
                      style={{
                        background: active ? theme.accent : theme.surface2,
                        color: active ? '#fff' : theme.text3,
                        border: `1px solid ${active ? `${theme.accent}50` : 'transparent'}`,
                      }}
                    >
                      {active && <Check size={11} />}
                      {QUESTION_TYPE_LABELS[type]}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs mt-1.5 px-1" style={{ color: theme.text3 }}>
                Distribuție: {previewDistribution(aiCount, aiQuestionTypes)}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: theme.text2 }}>
              Număr de {aiMode === 'clinical' ? 'cazuri' : 'întrebări'}
            </label>
            <div className="flex gap-2">
              {(aiMode === 'clinical' ? [3, 5, 10, 15] : [10, 25, 50, 100]).map((count) => (
                <button
                  key={count}
                  onClick={() => onCountChange(count)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-[background-color,border-color,color,opacity,transform]"
                  style={{
                    background: aiCount === count ? theme.accent : theme.surface2,
                    color: aiCount === count ? '#fff' : theme.text3,
                    border: `1px solid ${aiCount === count ? `${theme.accent}50` : 'transparent'}`,
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          {aiLoading && aiProgress && aiProgress.total > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: theme.text3 }}>
                  Generez...
                </span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: theme.accentText }}>
                  {aiProgress.generated}/{aiProgress.total}
                </span>
              </div>
              <ProgressBar percent={aiProgress.total > 0 ? (aiProgress.generated / aiProgress.total) * 100 : 0}
                heightClass="h-1.5" track={theme.surface2} color={theme.accent}
                transition={{ duration: dur.base, ease: ease.standard }} label="Progres generare AI" />
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onGenerate}
            disabled={aiLoading || !hasKey || !aiText.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{
              background: aiLoading || !hasKey || !aiText.trim()
                ? theme.surface2
                : theme.accent,
              color: aiLoading || !hasKey || !aiText.trim() ? theme.text3 : 'white',
            }}
          >
            {aiLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generez...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Generează {aiCount} {aiMode === 'clinical' ? 'cazuri clinice' : 'grile'}
              </>
            )}
          </motion.button>

          {aiError && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{ background: `${theme.danger}12`, border: `1px solid ${theme.danger}30`, color: theme.danger }}
            >
              {aiError}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
