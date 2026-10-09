/**
 * Window controls for frameless Electron on Windows.
 * Kept fixed in the top-right corner and styled as a compact premium capsule.
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Minus, X, Maximize2, Minimize2 } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';

interface BtnConfig {
  label: string;
  icon: React.ReactNode;
  hoverBg: string;
  hoverColor: string;
  width: number;
  isClose?: boolean;
}

function WinBtn({
  label,
  icon,
  hoverBg,
  hoverColor,
  width,
  isClose,
  onClick,
}: BtnConfig & { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();

  return (
    <motion.button
      onClick={onClick}
      title={label}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      whileTap={calmMotion ? undefined : { scale: 0.94 }}
      transition={t.tap}
      className="press-feedback focus-visible:shadow-[var(--ring-inset)]"
      style={{
        width,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        background: hover ? hoverBg : 'transparent',
        color: hover ? hoverColor : theme.text2,
        transition: 'background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
        flexShrink: 0,
        borderRadius: isClose ? '0 var(--r-lg) var(--r-lg) 0' : 0,
      }}
    >
      <motion.span
        animate={!calmMotion && isClose && hover ? { rotate: 90 } : { rotate: 0 }}
        transition={t.pop}
        style={{ display: 'flex', alignItems: 'center' }}
      >
        {icon}
      </motion.span>
    </motion.button>
  );
}

export default function WindowControls() {
  const [isMax, setIsMax] = useState(false);
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const theme = useTheme();

  useEffect(() => {
    if (!api) return;
    api.isMaximized().then(setIsMax).catch(() => {});
    const unsub = api.onMaximized(setIsMax);
    return unsub;
  }, [api]);

  if (!api) return null;

  return (
    <div
      className="premium-window-controls"
      style={{
        position: 'fixed',
        top: 6,
        right: 10,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        background: `color-mix(in srgb, ${theme.surface} 62%, transparent)`,
        backdropFilter: 'blur(var(--blur-2)) saturate(150%)',
        width: 136,
        height: 40,
        borderRadius: 'var(--r-lg)',
        border: `1px solid ${theme.border}`,
        boxShadow: 'var(--elev-2), inset 0 1px 0 var(--glass-highlight)',
        WebkitAppRegion: 'no-drag',
        overflow: 'hidden',
      } as React.CSSProperties & { WebkitAppRegion: string }}
    >
      <WinBtn
        label="Minimizează"
        icon={<Minus size={14} strokeWidth={2.4} />}
        hoverBg={'var(--hover-fill)'}
        hoverColor={theme.text}
        width={46}
        onClick={() => api.minimize()}
      />
      <WinBtn
        label={isMax ? 'Restaurează' : 'Maximizează'}
        icon={isMax ? <Minimize2 size={13} strokeWidth={2.4} /> : <Maximize2 size={13} strokeWidth={2.4} />}
        hoverBg={'var(--hover-fill)'}
        hoverColor={theme.text}
        width={46}
        onClick={() => api.maximize()}
      />
      <WinBtn
        label="Închide"
        icon={<X size={14} strokeWidth={2.5} />}
        hoverBg={theme.danger}
        hoverColor="#FFFFFF"
        width={46}
        isClose
        onClick={() => api.close()}
      />
    </div>
  );
}
