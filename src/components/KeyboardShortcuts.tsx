import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';

const SHORTCUTS = [
  { category: 'General', items: [
    { keys: ['?'], description: 'Arată sau ascunde scurtăturile' },
    { keys: ['Ctrl', 'K'], description: 'Căutare în tot conținutul' },
    { keys: ['Esc'], description: 'Închide fereastra deschisă' },
  ]},
  { category: 'Asistent AI', items: [
    { keys: ['Ctrl', 'Shift', 'F'], description: 'Chat în ecran complet' },
  ]},
  { category: 'Flashcarduri', items: [
    { keys: ['Spațiu'], description: 'Întoarce cartonașul' },
    { keys: ['1', '2', '3'], description: 'Greu, Bine, Ușor' },
  ]},
  { category: 'Recapitulare', items: [
    { keys: ['1', '2', '3', '4'], description: 'Notează răspunsul, de la „Nu știam” la „Sigur”' },
    { keys: ['Enter'], description: 'Confirmă / continuă' },
  ]},
];

function Key({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <kbd
      className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-semibold min-w-[24px]"
      style={{
        background: 'var(--fill-subtle)',
        border: `1px solid ${theme.border2}`,
        color: theme.text2,
        fontFamily: 'monospace',
        boxShadow: theme.isDark
          ? '0 2px 0 rgba(0,0,0,0.4)'
          : '0 2px 0 rgba(0,0,0,0.12)',
      }}
    >
      {label}
    </kbd>
  );
}

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const navigate = useNavigate();
  const { calmMotion, performanceLite } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(open, () => setOpen(false));

  // G + key navigation state - eliminat pentru a evita conflicte

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

      // Esc always closes modal
      if (e.key === 'Escape') { setOpen(false); return; }

      if (isInput) return;

      // ? → open shortcuts modal
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setOpen(v => !v);
        return;
      }

      // Ctrl+K → global search (dispatched separately in GlobalSearch)

      // G + [key] navigation - eliminat pentru a evita conflictele cu typing
      // Folosim Ctrl+G + key în schimb

      // N -> new quiz - eliminat pentru a evita conflictele
      // Folosim Ctrl+N în schimb
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={calmMotion ? { duration: 0.12 } : { duration: 0.18 }}
            className="fixed inset-0 z-[200]"
            style={{ background: 'var(--overlay)', backdropFilter: performanceLite ? 'blur(2px)' : 'blur(6px)' }}
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 20 }}
            transition={calmMotion ? { duration: 0.16, ease: 'easeOut' } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-shortcuts-title"
            className="fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex w-[calc(100vw-1.5rem)] max-h-[calc(100vh-2rem)] max-w-md flex-col rounded-3xl overflow-hidden"
            style={{
              background: theme.modalBg,
              border: `1px solid ${theme.border2}`,
              boxShadow: performanceLite ? '0 18px 42px rgba(0,0,0,0.28)' : '0 32px 80px rgba(0,0,0,0.45), 0 0 0 1px var(--hairline)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: `${theme.accent}18`, color: theme.accentText }}>
                  <Command size={15} />
                </div>
                <div>
                  <h2 id="keyboard-shortcuts-title" className="text-sm font-bold" style={{ color: theme.text }}>Scurtături tastatură</h2>
                  <p className="text-xs" style={{ color: theme.text3 }}>Navighează mai rapid</p>
                </div>
              </div>
              <motion.button 
                whileHover={calmMotion ? undefined : { scale: 1.1, rotate: 90 }}
                whileTap={calmMotion ? undefined : { scale: 0.9 }}
                onClick={() => setOpen(false)}
                aria-label="Închide"
                className="p-2 rounded-xl transition-all"
                style={{ color: theme.text3, background: theme.surface2, cursor: 'pointer' }}>
                <X size={14} />
              </motion.button>
            </div>

            {/* Content */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {SHORTCUTS.map((section) => (
                <div key={section.category}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: theme.text3 }}>
                    {section.category}
                  </p>
                  <div className="space-y-2">
                    {section.items.map((item) => (
                      <div key={item.description} className="flex items-center justify-between">
                        <span className="text-sm" style={{ color: theme.text2 }}>
                          {item.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((k, i) => (
                            <span key={k} className="flex items-center gap-1">
                              {i > 0 && <span className="text-xs" style={{ color: theme.text3 }}>{item.keys.includes('Ctrl') ? '+' : '/'}</span>}
                              <Key label={k} />
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 flex items-center justify-center gap-1.5"
              style={{ borderTop: `1px solid ${theme.border}`, background: `${theme.surface}` }}>
              <Key label="?" />
              <span className="text-xs" style={{ color: theme.text3 }}>pentru a deschide/închide</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
