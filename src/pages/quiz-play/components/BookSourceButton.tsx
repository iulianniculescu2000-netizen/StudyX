import { BookOpen } from 'lucide-react';
import type { Theme } from '../../../theme/themes';

interface BookSourceButtonProps {
  onOpen: () => void;
  status: 'idle' | 'loading' | 'none';
  loadingLabel: string;
  theme: Theme;
}

/** „Vezi în carte”: pornește agentul la cerere; când nu găsește nimic potrivit, spune asta. */
export default function BookSourceButton({ onOpen, status, loadingLabel, theme }: BookSourceButtonProps) {
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
        {status === 'loading' ? loadingLabel : 'Vezi în carte'}
      </button>
      {status === 'none' && (
        <span role="status" className="text-[12px]" style={{ color: theme.text3 }}>Nu am găsit în cărți un pasaj care să susțină această grilă.</span>
      )}
    </div>
  );
}
