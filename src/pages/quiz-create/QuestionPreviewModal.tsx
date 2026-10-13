import Portal from '../../components/Portal';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { Question } from '../../types';
import type { Theme } from '../../theme/themes';

interface QuestionPreviewModalProps {
  previewQ: Question | null;
  theme: Theme;
  onClose: () => void;
}

/** Panou de dialog: focus în el, Tab rămâne înăuntru, Esc închide, focusul revine la butonul de previzualizare. */
function PreviewPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useFocusTrap(true, onClose);
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Previzualizare întrebare"
      initial={{ opacity: 0, scale: 0.95, y: -20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed top-[8%] left-1/2 z-[201] w-full max-w-xl -translate-x-1/2 px-4"
    >
      {children}
    </motion.div>
  );
}

export function QuestionPreviewModal({ previewQ, theme, onClose }: QuestionPreviewModalProps) {
  return (
    <Portal>
    <AnimatePresence>
      {previewQ && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200]"
            style={{ background: 'var(--overlay)', backdropFilter: 'blur(6px)' }}
          />
          <PreviewPanel onClose={onClose}>
            <div
              className="rounded-[var(--r-lg)] p-6"
              style={{
                boxShadow: 'var(--elev-4)',
                background: theme.surface,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: theme.accentText }}>
                  Previzualizare
                </span>
                <button data-autofocus onClick={onClose} aria-label="Închide previzualizarea" className="focus-ring rounded-lg p-1" style={{ color: theme.text3 }}>
                  <X size={16} />
                </button>
              </div>
              <p className="text-lg font-semibold mb-4 leading-relaxed" style={{ color: theme.text }}>
                {previewQ.text || '(fără text)'}
              </p>
              {previewQ.imageUrl && (
                <div className="mb-4 overflow-hidden rounded-2xl" style={{ border: `1px solid ${theme.border}`, background: theme.surface2 }}>
                  <img
                    src={previewQ.imageUrl}
                    alt=""
                    className="block w-full max-h-[min(360px,40vh)] object-contain"
                  />
                </div>
              )}
              <div className="space-y-2">
                {previewQ.options.map((option, index) => (
                  <div
                    key={option.id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      background: option.isCorrect ? `${theme.success}14` : theme.surface2,
                      border: `1px solid ${option.isCorrect ? `${theme.success}40` : theme.border}`,
                    }}
                  >
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: option.isCorrect ? `${theme.success}20` : theme.surface,
                        color: option.isCorrect ? theme.success : theme.text3,
                      }}
                    >
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="text-sm" style={{ color: option.isCorrect ? theme.success : theme.text2 }}>
                      {option.text || '(fără text)'}
                    </span>
                    {option.isCorrect && <Check size={14} className="ml-auto flex-shrink-0" style={{ color: theme.success }} />}
                  </div>
                ))}
              </div>
              {previewQ.explanation && (
                <div className="mt-4 p-3 rounded-xl" style={{ background: `${theme.accent}0C`, border: `1px solid ${theme.accent}20` }}>
                  <p className="text-xs" style={{ color: theme.text2 }}>
                    <span className="font-semibold" style={{ color: theme.accentText }}>Explicație: </span>
                    {previewQ.explanation}
                  </p>
                </div>
              )}
            </div>
          </PreviewPanel>
        </>
      )}
    </AnimatePresence>
    </Portal>
  );
}
