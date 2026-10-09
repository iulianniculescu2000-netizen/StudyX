import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';

interface ModalShellProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Butoanele de jos (de obicei „Anulează” și acțiunea principală). */
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' } as const;

/**
 * Fereastra de dialog a aplicației pentru formulare: fundal estompat, panou de sticlă, titlu fix sus și butoane fixe jos,
 * iar conținutul derulează între ele. Se închide cu Esc sau click pe fundal; focusul rămâne în ea cât e deschisă.
 */
export default function ModalShell({ open, title, subtitle, onClose, children, footer, width = 'md' }: ModalShellProps) {
  const theme = useTheme();
  const { t } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(open, onClose);
  useScrollLock(open);
  const titleId = useId();

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t.modal}
            className="fixed inset-0 z-[9990]"
            style={{ background: 'var(--overlay)', backdropFilter: 'blur(var(--blur-1))' }}
            onClick={onClose}
          />
          <motion.div
            key="modal-panel"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
            exit={{ opacity: 0, y: 10, scale: 0.985, transition: t.modalExit }}
            className={`fixed left-1/2 top-1/2 z-[9991] w-full -translate-x-1/2 -translate-y-1/2 px-4 ${WIDTH[width]}`}
          >
            <div
              className="premium-modal relative flex max-h-[86vh] flex-col overflow-hidden rounded-[var(--r-lg)]"
              style={{ background: theme.modalBg, border: `1px solid ${theme.border2}` }}
            >
              <div className="flex items-start gap-3 px-6 pb-3 pt-5">
                <div className="min-w-0 flex-1">
                  <h3 id={titleId} className="text-[16px] font-semibold leading-snug" style={{ color: theme.text }}>{title}</h3>
                  {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: theme.text3 }}>{subtitle}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Închide"
                  className="press-feedback flex-shrink-0 rounded-full p-1.5"
                  style={{ color: theme.text3, background: theme.surface2 }}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-1">{children}</div>
              {footer && (
                <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: theme.border }}>
                  {footer}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
