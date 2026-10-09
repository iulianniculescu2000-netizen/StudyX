import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useId } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useScrollLock } from '../hooks/useScrollLock';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmă',
  cancelLabel = 'Anulează',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(open, onCancel);
  useScrollLock(open);
  const titleId = useId();
  const descriptionId = useId();

  const variantColor = variant === 'danger' ? theme.danger : variant === 'warning' ? theme.warning : theme.accent;
  const Icon = variant === 'danger' ? Trash2 : AlertTriangle;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t.modal}
            className="fixed inset-0 z-[10005]"
            style={{ background: 'var(--overlay)', backdropFilter: 'blur(var(--blur-1))' }}
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
            exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
            className="fixed z-[10006] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm"
            style={{ padding: '0 16px' }}
          >
            <div
              className="premium-modal relative rounded-[var(--r-lg)] p-6"
              style={{ background: theme.modalBg, border: `1px solid ${theme.border2}` }}
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-[var(--r-md)] flex items-center justify-center mb-4"
                style={{ background: `${variantColor}18` }}
              >
                <Icon size={22} style={{ color: variantColor }} />
              </div>

              {/* Title */}
              <h3 id={titleId} className="text-base font-semibold mb-1.5 leading-snug" style={{ color: theme.text }}>
                {title}
              </h3>

              {/* Description */}
              {description && (
                <p id={descriptionId} className="text-sm leading-relaxed mb-5" style={{ color: theme.text2 }}>
                  {description}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <motion.button
                  whileTap={calmMotion ? undefined : { scale: 0.97 }}
                  onClick={onCancel}
                  data-autofocus
                  className="flex-1 py-3 rounded-[var(--r-md)] text-sm font-bold transition-colors press-feedback"
                  style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border2}` }}
                >
                  {cancelLabel}
                </motion.button>
                <motion.button
                  whileTap={calmMotion ? undefined : { scale: 0.97 }}
                  onClick={onConfirm}
                  className="elev-1 flex-1 py-3 rounded-[var(--r-md)] text-sm font-black text-white transition-colors press-feedback"
                  style={{ background: variantColor }}
                >
                  {confirmLabel}
                </motion.button>
              </div>

              {/* Close X button */}
              <motion.button
                type="button"
                aria-label="Închide"
                onClick={onCancel}
                whileTap={calmMotion ? undefined : { scale: 0.92 }}
                className="fine-row absolute top-4 right-4 p-1.5 rounded-[var(--r-sm)] press-feedback"
                style={{ color: theme.text3, cursor: 'pointer' }}
              >
                <X size={14} />
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
