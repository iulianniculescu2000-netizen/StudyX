import { BookOpen } from 'lucide-react';
import type { Theme } from '../../../theme/themes';

interface BookSourceButtonProps {
  onOpen: () => void;
  /** `ai-*`: AI-ul n-a putut verifica (limită de cereri sau indisponibil) și căutarea locală n-a găsit o potrivire sigură. */
  status: 'idle' | 'loading' | 'none' | 'ai-rate-limit' | 'ai-unavailable';
  loadingLabel: string;
  theme: Theme;
}

const AI_DOWN_MESSAGE = {
  'ai-rate-limit': 'AI indisponibil acum (limită de cereri); am căutat local și n-am găsit un pasaj sigur.',
  'ai-unavailable': 'AI indisponibil acum; am căutat local și n-am găsit un pasaj sigur.',
} as const;

/** „Vezi în carte”: pornește agentul la cerere; spune separat „cartea nu are pasajul” și „AI-ul nu a fost disponibil”. */
export default function BookSourceButton({ onOpen, status, loadingLabel, theme }: BookSourceButtonProps) {
  const aiDown = status === 'ai-rate-limit' || status === 'ai-unavailable';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        disabled={status === 'loading'}
        className="press-feedback focus-ring glass-panel inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-60"
        style={{ color: theme.accentText }}
      >
        <BookOpen size={13} aria-hidden="true" />
        {status === 'loading' ? loadingLabel : aiDown ? 'Încearcă din nou' : 'Vezi în carte'}
      </button>
      {status === 'none' && (
        <span role="status" className="text-[12px]" style={{ color: theme.text3 }}>Nu am găsit în cărți un pasaj care să susțină această grilă.</span>
      )}
      {aiDown && (
        <span role="status" className="text-[12px]" style={{ color: theme.text3 }}>{AI_DOWN_MESSAGE[status]}</span>
      )}
    </div>
  );
}
