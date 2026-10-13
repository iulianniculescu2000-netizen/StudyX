import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';

const SHORTCUTS = [
  { category: 'General', items: [
    { keys: ['?'], description: 'Arată sau ascunde scurtăturile' },
    { keys: ['Ctrl', 'K'], description: 'Căutare în tot conținutul' },
    { keys: ['Ctrl', '+ / -'], description: 'Mărește sau micșorează textul' },
    { keys: ['Ctrl', '0'], description: 'Resetează mărimea textului' },
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
        boxShadow: 'var(--elev-1)',
      }}
    >
      {label}
    </kbd>
  );
}

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const { calmMotion, performanceLite } = useAdaptiveMotion();
  const dialogRef = useFocusTrap(open, () => setOpen(false));

  // G + key navigation state - eliminat pentru a evita conflicte

  // Restore persisted UI zoom on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('studyx_zoom_factor');
      if (saved !== null) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed >= 0.75 && parsed <= 1.5) {
          window.electronAPI?.setZoomFactor?.(parsed);
        } else {
          localStorage.removeItem('studyx_zoom_factor');
          window.electronAPI?.setZoomFactor?.(1);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput = Boolean(
        target && (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable ||
          target.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')
        )
      );

      // Esc always closes modal
      if (e.key === 'Escape') { setOpen(false); return; }

      // Nu interfera cu tastarea utilizatorului în câmpuri de text sau editor Markdown (e.g. caracterele +, -)
      if (isInput) return;

      // Zoom in / out / reset shortcuts (doar Ctrl/Cmd fără Alt, pentru a nu intercepta taste AltGr)
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const isZoomIn = e.key === '=' || e.key === '+' || e.code === 'NumpadAdd';
        const isZoomOut = e.key === '-' || e.code === 'NumpadSubtract';
        const isZoomReset = e.key === '0' || e.code === 'Numpad0';

        if (isZoomIn) {
          e.preventDefault();
          const current = window.electronAPI?.getZoomFactor?.() ?? 1;
          const safeCurrent = typeof current === 'number' && Number.isFinite(current) && current > 0 ? current : 1;
          const next = Math.min(1.5, Math.round((safeCurrent + 0.1) * 10) / 10);
          window.electronAPI?.setZoomFactor?.(next);
          try { localStorage.setItem('studyx_zoom_factor', String(next)); } catch { /* ignore */ }
          return;
        }
        if (isZoomOut) {
          e.preventDefault();
          const current = window.electronAPI?.getZoomFactor?.() ?? 1;
          const safeCurrent = typeof current === 'number' && Number.isFinite(current) && current > 0 ? current : 1;
          const next = Math.max(0.75, Math.round((safeCurrent - 0.1) * 10) / 10);
          window.electronAPI?.setZoomFactor?.(next);
          try { localStorage.setItem('studyx_zoom_factor', String(next)); } catch { /* ignore */ }
          return;
        }
        if (isZoomReset) {
          e.preventDefault();
          window.electronAPI?.setZoomFactor?.(1);
          try { localStorage.setItem('studyx_zoom_factor', '1'); } catch { /* ignore */ }
          return;
        }
      }

      // ? → open shortcuts modal
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setOpen(v => !v);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
              boxShadow: performanceLite ? 'var(--elev-3)' : 'var(--elev-4), var(--hairline-ring)',
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
