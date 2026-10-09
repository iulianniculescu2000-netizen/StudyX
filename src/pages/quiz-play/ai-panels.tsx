import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles, Zap } from 'lucide-react';
import type { AIAnalysisResult, HintResult } from '../../ai/types';
import type { Theme } from '../../theme/themes';
import AIRichText from '../../components/ai-chat/AIRichText';
import { dur, ease, press } from '../../theme/motion';

interface HintPanelProps {
  calmMotion: boolean;
  examMode: boolean;
  usesRemoteAI: boolean;
  hintLevel: number;
  hintData: HintResult | null;
  hintLoading: boolean;
  revealed: boolean;
  showSmartNudge: boolean;
  onGetHint: () => void;
  theme: Theme;
}

export function HintPanel({
  calmMotion,
  examMode,
  usesRemoteAI,
  hintLevel,
  hintData,
  hintLoading,
  revealed,
  showSmartNudge,
  onGetHint,
  theme,
}: HintPanelProps) {
  if (revealed || examMode) return null;

  return (
    <div className="mb-5">
      <AnimatePresence mode="wait">
        {hintLevel === 0 ? (
          <motion.button
            initial={{ opacity: 0, y: 5 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: showSmartNudge && !calmMotion ? [1, 1.02, 1] : 1,
            }}
            transition={showSmartNudge && !calmMotion
              ? { scale: { repeat: Infinity, duration: 3.6, ease: 'easeInOut' } }
              : { duration: calmMotion ? dur.instant : dur.fast }}
            exit={{ opacity: 0 }}
            onClick={onGetHint}
            disabled={hintLoading}
            className="group relative flex items-center gap-2 overflow-hidden rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-[background-color,border-color,color,opacity,transform]"
            style={{
              background: theme.surface,
              border: `1px solid ${showSmartNudge ? theme.accent : theme.border}`,
              color: theme.accentText,
              boxShadow: showSmartNudge ? 'var(--glow-1)' : 'var(--elev-1)',
            }}
            whileTap={calmMotion ? undefined : press.whileTap}
          >
            {!calmMotion && (
              <motion.div
                className="absolute inset-0 z-0"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                style={{
                  background: `linear-gradient(90deg, transparent, ${theme.accent}15, transparent)`,
                  width: '50%',
                }}
              />
            )}

            <div className="relative z-10 flex items-center gap-2">
              {hintLoading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>{hintLoading ? 'Analizez...' : (usesRemoteAI ? 'Indiciu AI' : 'Indiciu smart')}</span>
              <span className="ml-1 rounded border border-current px-1 font-mono text-[9px]" style={{ color: theme.text3 }}>H</span>
            </div>
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.base, ease: ease.standard }}
            className="glass-panel relative overflow-hidden rounded-[var(--r-lg)] p-4"
            style={{
              background: `${theme.accent}08`,
              border: `1px solid ${theme.accent}25`,
              boxShadow: 'var(--elev-1)',
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={14} style={{ color: theme.accentText }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: theme.accentText }}>
                  {usesRemoteAI ? 'Indiciu AI' : 'Indiciu ghidat'} • Nivel {hintLevel}/3
                </span>
              </div>
              {hintLevel < 3 && (
                <button
                  onClick={onGetHint}
                  className="rounded-lg px-2 py-1 text-[10px] font-bold transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
                  style={{ background: `${theme.accent}15`, color: theme.accentText }}
                >
                  + Mai mult
                </button>
              )}
            </div>
            <p className="text-sm font-medium italic leading-relaxed" style={{ color: theme.text }}>
              "{hintLevel === 1 ? hintData?.light : hintLevel === 2 ? hintData?.medium : hintData?.full}"
            </p>

            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full blur-[60px] opacity-20" style={{ background: theme.accent }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface AIExplanationPanelProps {
  aiLoading: boolean;
  aiText: string | null;
  analysisResult: AIAnalysisResult | null;
  examMode: boolean;
  usesRemoteAI: boolean;
  nextTopicHint: string | null;
  revealed: boolean;
  onExplain: () => void;
  theme: Theme;
}

export function AIExplanationPanel({
  aiLoading,
  aiText,
  analysisResult,
  examMode,
  usesRemoteAI,
  nextTopicHint,
  revealed,
  onExplain,
  theme,
}: AIExplanationPanelProps) {
  if (!revealed || examMode) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: dur.base, ease: ease.standard }}
        className="mb-4"
      >
        {aiText === null ? (
          <button
            onClick={onExplain}
            disabled={aiLoading}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
            style={{
              background: `${theme.accent2}15`,
              border: `1px solid ${theme.accent2}30`,
              color: theme.accent2,
              opacity: aiLoading ? 0.72 : 1,
              cursor: aiLoading ? 'wait' : 'pointer',
            }}
          >
            {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {aiLoading ? 'Pregătesc explicația...' : (usesRemoteAI ? 'Explică AI' : 'Explică smart')}
          </button>
        ) : (
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-3xl p-5"
            style={{ background: `${theme.accent2}0C`, border: `1.5px solid ${theme.accent2}25` }}
          >
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={14} style={{ color: theme.accent2 }} />
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: theme.accent2 }}>
                {usesRemoteAI ? 'Explicație AI' : 'Explicație ghidată'}
              </span>
              {aiLoading && (
                <div
                  className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ background: theme.accent2 }}
                />
              )}
            </div>
            <div className="text-sm leading-generous" style={{ color: theme.text2, lineHeight: '1.7', fontSize: '15px' }}>
              <AIRichText text={aiText} />
              {aiLoading && <span className="animate-pulse">...</span>}
            </div>
            {analysisResult?.mistakeType && (
              <div className="mt-4 border-t border-dashed pt-4 opacity-60" style={{ borderColor: `${theme.accent2}30` }}>
                <div className="mb-1 text-[10px] font-black uppercase tracking-widest" style={{ color: theme.accent2 }}>Analiză eroare</div>
                <div className="text-xs" style={{ color: theme.text3 }}>{analysisResult.mistakeType}</div>
              </div>
            )}
            {analysisResult?.rule && (
              <div className="mt-2 text-xs italic" style={{ color: theme.text3 }}>
                Regulă: {analysisResult.rule}
              </div>
            )}
            {nextTopicHint && (
              <div className="mt-2 text-xs font-bold" style={{ color: theme.accentText }}>
                Focus AI recomandat: {nextTopicHint}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

interface MnemonicPanelProps {
  examMode: boolean;
  usesRemoteAI: boolean;
  mnemonicLoading: boolean;
  mnemonicText: string | null;
  revealed: boolean;
  wasWrong: boolean;
  onGenerate: () => void;
  theme: Theme;
}

export function MnemonicPanel({
  examMode,
  usesRemoteAI,
  mnemonicLoading,
  mnemonicText,
  revealed,
  wasWrong,
  onGenerate,
  theme,
}: MnemonicPanelProps) {
  if (!revealed || examMode || !wasWrong) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        {mnemonicText === null ? (
          <button
            disabled={mnemonicLoading}
            onClick={onGenerate}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
            style={{ background: `${theme.warning}15`, border: `1px solid ${theme.warning}30`, color: theme.warning }}
          >
            {mnemonicLoading
              ? <><Loader2 size={12} className="animate-spin" />Generez mnemonic...</>
              : <><Zap size={12} />{usesRemoteAI ? 'Mnemonic AI' : 'Mnemonic smart'}</>}
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-4"
            style={{ background: `${theme.warning}0C`, border: `1px solid ${theme.warning}25` }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Zap size={12} style={{ color: theme.warning }} />
              <span className="text-xs font-semibold" style={{ color: theme.warning }}>Mnemonic</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: theme.text2 }}>{mnemonicText}</p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
