import { motion } from 'framer-motion';
import { RefreshCw, Check, Download, ArrowDownCircle, RotateCcw, AlertCircle } from 'lucide-react';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import Tip from './Tip';

/** Update button - opens the premium UpdateModal */
export default function UpdateButton({
  collapsed, status, localVersion, downloadPercent, onOpen, theme,
}: {
  collapsed: boolean;
  status: string;
  localVersion: string;
  downloadPercent: number;
  onOpen: () => void;
  theme: import('../../theme/themes').Theme;
}) {
  const { calmMotion } = useAdaptiveMotion();
  if (!window.electronAPI?.updaterCheck) return null;

  const hasAction = status === 'available' || status === 'error' || status === 'ready';
  const isDownloading = status === 'downloading';
  const isChecking = status === 'checking';

  let icon: React.ReactNode;
  let color: string = theme.text3;

  if (isChecking) {
    icon = calmMotion
      ? <span><RefreshCw size={14} /></span>
      : <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><RefreshCw size={14} /></motion.span>;
    color = theme.text3;
  } else if (status === 'up-to-date') {
    icon = <Check size={14} />;
    color = theme.success;
  } else if (status === 'available') {
    icon = <ArrowDownCircle size={14} />;
    color = theme.accent;
  } else if (isDownloading) {
    icon = <Download size={14} />;
    color = theme.accent;
  } else if (status === 'ready') {
    icon = <RotateCcw size={14} />;
    color = theme.success;
  } else if (status === 'error') {
    icon = <AlertCircle size={14} />;
    color = theme.danger;
  } else {
    icon = <Download size={14} />;
    color = theme.text3;
  }

  const label = isChecking ? 'Se verifică...'
    : status === 'up-to-date' ? 'La zi'
    : status === 'available' ? 'Actualizare disponibilă'
    : isDownloading ? `Descărcare ${downloadPercent}%`
    : status === 'ready' ? 'Gata de instalat'
    : status === 'error' ? 'Eroare actualizare'
    : `v${localVersion}`;

  return (
    <Tip label={collapsed ? label : ''}>
      <button
        onClick={onOpen}
        aria-label={label}
        className="press-feedback w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors hover:bg-[var(--hover-fill)] relative"
        style={{ color, justifyContent: collapsed ? 'center' : 'flex-start' }}
      >
        {/* Pulsing dot for actionable states */}
        {hasAction && (
          <motion.div
            className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full glow-pulse"
            style={{ background: status === 'error' ? theme.danger : status === 'ready' ? theme.success : theme.accent }}
          />
        )}
        {icon}
        {!collapsed && (
          <span className="text-xs truncate flex-1 text-left" style={{ color }}>{label}</span>
        )}
        {/* Inline download progress bar */}
        {!collapsed && isDownloading && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: theme.surface2 }}>
            <motion.div className="h-full progress-fill-anim" style={{ background: theme.accent }}
              animate={{ width: `${downloadPercent}%` }}
            />
          </div>
        )}
      </button>
    </Tip>
  );
}
