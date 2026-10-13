import type { FC } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import AIOrb from './AIOrb';

/** Un singur text, adevărat: aplicația nu știe în ce fază de „raționament” e modelul, deci nu inventează pași. */
export const DEFAULT_THINKING_TEXT = 'Mă gândesc…';

export interface AIThinkingIndicatorProps {
  /** Textul fazei curente, când aplicația o cunoaște („Caut în materialele tale…”). */
  stepText?: string;
  /** Format compact pentru interiorul unei bule de mesaj sau pentru antet. */
  compact?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * „Răspunsul se pregătește”: un orb și o linie de text, în culorile temei (suprafață, margine, text), la fel în tema
 * deschisă și în cea închisă. Orb-ul animat se oprește cu mișcare redusă (`calm`).
 */
export const AIThinkingIndicator: FC<AIThinkingIndicatorProps> = ({
  stepText,
  compact = false,
  size = 'md',
  className = '',
}) => {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const text = stepText ?? DEFAULT_THINKING_TEXT;
  const orbSize = compact ? 20 : size === 'sm' ? 22 : size === 'md' ? 32 : 44;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${compact ? 'flex w-fit items-center gap-2 px-3 py-1.5' : 'mx-auto flex max-w-md flex-col items-center justify-center gap-3 p-5'} select-none rounded-full ${className}`}
      style={{
        background: theme.fillSubtle,
        border: `1px solid ${theme.border}`,
        borderRadius: compact ? undefined : 'var(--r-lg)',
      }}
    >
      <AIOrb theme={theme} size={orbSize} active calm={calmMotion} />
      <span className="text-[12px] font-medium tracking-tight" style={{ color: theme.text2 }}>{text}</span>
    </div>
  );
};

export default AIThinkingIndicator;
