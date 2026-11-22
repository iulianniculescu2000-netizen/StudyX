import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, type ToastType } from '../store/toastStore';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import Portal from './Portal';

const TOAST_LABELS: Record<ToastType, string> = {
  success: 'Succes',
  error: 'Eroare',
  warning: 'Atenție',
  info: 'StudyX',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  // Cel mult 4 deodată; cele mai vechi cedează locul.
  const visible = toasts.slice(-4);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 size={17} color={theme.success} />,
    error: <AlertCircle size={17} color={theme.danger} />,
    info: <Info size={17} color={theme.accent} />,
    warning: <AlertTriangle size={17} color={theme.warning} />,
  };

  const badgeBg: Record<ToastType, string> = {
    success: `${theme.success}1c`,
    error: `${theme.danger}1c`,
    info: `${theme.accent}1c`,
    warning: `${theme.warning}1c`,
  };

  return (
    <Portal>
      {/* Apple-style banners: anchored top-center, drop in with a soft spring bounce. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="fixed top-14 left-1/2 z-[9999] flex w-full -translate-x-1/2 flex-col items-center gap-2.5 px-4 pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {visible.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              /* Ancorat sus: intră din y negativ (oglinda lui toastIn, care urcă de jos). */
              initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0, transition: t.toast }}
              exit={{ opacity: 0, ...(calmMotion ? {} : { y: -12 }), transition: t.toastExit }}
              role={toast.type === 'error' ? 'alert' : undefined}
              className="pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-[var(--r-lg)] px-3.5 py-3"
              style={{
                background: 'var(--glass-panel-strong)',
                backdropFilter: 'blur(var(--blur-2)) saturate(160%)',
                WebkitBackdropFilter: 'blur(var(--blur-2)) saturate(160%)',
                border: `0.5px solid ${theme.border}`,
                boxShadow: 'var(--elev-3)',
              }}
            >
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
                style={{ background: badgeBg[toast.type] }}
              >
                {icons[toast.type]}
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[10.5px] font-black uppercase tracking-[0.08em]"
                    style={{ color: theme.text3 }}
                  >
                    {TOAST_LABELS[toast.type]}
                  </span>
                  <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: theme.text3 }}>
                    acum
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: theme.text }}>
                  {toast.message}
                </p>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="mt-1.5 rounded-[var(--r-sm)] px-2.5 py-1 text-xs font-bold transition-colors"
                    style={{ background: `${theme.accent}1a`, color: theme.accentText }}
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                aria-label="Închide notificarea"
                className="fine-row flex-shrink-0 rounded-[var(--r-sm)] p-1 transition-colors hover:bg-[var(--hover-fill)]"
                style={{ color: theme.text3 }}
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
