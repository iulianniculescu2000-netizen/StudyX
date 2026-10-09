import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import Portal from '../Portal';

/** Tooltip shown on collapsed sidebar items. Drawn in a portal: the sidebar is overflow-hidden and would clip it. */
export default function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const show = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({ x: rect.right + 12, y: rect.top + rect.height / 2 });
  };
  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={() => setAnchor(null)}>
      {children}
      {label && (
        <Portal>
          <AnimatePresence>
            {anchor && (
              <motion.div
                initial={calmMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={t.pop}
                className="fixed rounded-[var(--r-sm)] px-3 py-1.5 text-xs font-medium whitespace-nowrap pointer-events-none"
                role="tooltip"
                style={{
                  left: anchor.x,
                  top: anchor.y,
                  transform: 'translateY(-50%)',
                  zIndex: 600,
                  background: theme.surface,
                  border: `1px solid ${theme.border2}`,
                  color: theme.text,
                  boxShadow: 'var(--elev-3)',
                }}
              >
                {label}
              </motion.div>
            )}
          </AnimatePresence>
        </Portal>
      )}
    </div>
  );
}
