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
      {/* Bottom-right, above the AI launcher and the "back to top" button: at the top they covered page titles and header
          buttons (Biblioteca AI: AI Studio, Adaugă, OCR). They rise in with a soft spring. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-[104px] right-6 z-[9999] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col items-end gap-2.5"
      >
        <AnimatePresence mode="popLayout">
          {visible.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              /* Ancorat jos: urcă de jos și iese spre dreapta, fără să împingă brusc celelalte (layout). */
              initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: t.toast }}
              exit={{ opacity: 0, ...(calmMotion ? {} : { x: 24 }), transition: t.toastExit }}
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
