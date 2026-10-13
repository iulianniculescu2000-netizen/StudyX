import { useState, useEffect, type FC } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import AIOrb from './AIOrb';

const DEFAULT_REASONING_STEPS = [
  'Analizez contextul întrebării medicale...',
  'Corelez ghidurile clinice de rezidențiat...',
  'Identific capcanele de diagnostic diferențial...',
  'Formulez explicația structurată...',
];

export interface AIThinkingIndicatorProps {
  /** Textul pasului curent, sau lasă gol pentru derularea automată a pașilor clinici. */
  stepText?: string;
  /** Format compact pentru afișarea în interiorul bulei de mesaj sau în header. */
  compact?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const AIThinkingIndicator: FC<AIThinkingIndicatorProps> = ({
  stepText,
  compact = false,
  size = 'md',
  className = '',
}) => {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  useEffect(() => {
    if (stepText || calmMotion) return;
    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => (prev + 1) % DEFAULT_REASONING_STEPS.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [stepText, calmMotion]);

  const activeText = stepText ?? DEFAULT_REASONING_STEPS[currentStepIdx];
  const orbSize = size === 'sm' ? 22 : size === 'md' ? 32 : 44;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border bg-slate-900/60 backdrop-blur-md select-none ${className}`}
        style={{ borderColor: `${theme.accent}30` }}
      >
        <AIOrb theme={theme} size={orbSize} active={true} calm={calmMotion} />
        <span
          className="text-[12px] font-semibold tracking-tight"
          style={{ color: theme.isDark ? '#f472b6' : '#db2777' }}
        >
          {activeText}
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-5 rounded-2xl border bg-slate-950/40 backdrop-blur-xl shadow-xl select-none max-w-md mx-auto ${className}`}
      style={{
        borderColor: `${theme.accent}30`,
        boxShadow: `0 8px 32px -4px ${theme.accent}20`,
      }}
    >
      {/* Synaptic Neural Core */}
      <div className="mb-4">
        <AIOrb theme={theme} size={orbSize} active={true} calm={calmMotion} />
      </div>

      {/* Dynamic Animated Thought Streamer */}
      <div className="h-6 flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeText}
            initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="flex items-center gap-2"
          >
            <span
              className="w-2 h-2 rounded-full animate-ping"
              style={{ background: theme.isDark ? '#ec4899' : theme.accent }}
            />
            <span
              className="text-xs font-bold tracking-tight text-center"
              style={{ color: theme.isDark ? '#fce7f3' : '#831843' }}
            >
              {activeText}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mt-1 text-[11px] font-medium opacity-65" style={{ color: theme.text2 }}>
        Raționament clinic în desfășurare • Model StudyX
      </p>

      {/* Synapse Connection Matrix Mini-Pill Bars */}
      {!calmMotion && (
        <div className="flex items-center gap-1.5 mt-3.5">
          {DEFAULT_REASONING_STEPS.map((_, idx) => {
            const isActive = idx <= currentStepIdx;
            return (
              <motion.div
                key={idx}
                className="h-1 rounded-full"
                style={{
                  width: idx === currentStepIdx ? 24 : 12,
                  background: isActive ? (theme.isDark ? '#ec4899' : theme.accent) : `${theme.border}`,
                }}
                animate={{
                  opacity: isActive ? 1 : 0.35,
                }}
                transition={{ duration: 0.3 }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AIThinkingIndicator;
