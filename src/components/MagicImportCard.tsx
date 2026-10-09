/**
 * The "wow" entry point for importing grile from a document or photo.
 *
 * A small looping scan animation shows exactly what the feature does — a page
 * gets scanned and a correct answer lights up — so the value reads at a glance.
 * Leads with the photo hook but covers every source. Opens the import flow.
 */
import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, X } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import Portal from './Portal';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import ImportFromDocument from './ImportFromDocument';

function ScanVisual({ animate }: { animate: boolean }) {
  const theme = useTheme();
  const rows = [22, 34, 46, 58];
  return (
    <svg viewBox="0 0 92 92" width={72} height={72} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="scanline" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={theme.accent} stopOpacity="0" />
          <stop offset="0.5" stopColor={theme.accent} stopOpacity="0.9" />
          <stop offset="1" stopColor={theme.accent2 ?? theme.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* page */}
      <rect x="20" y="10" width="52" height="72" rx="8" fill={theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)'} stroke={theme.border} />
      {/* option rows */}
      {rows.map((y, i) => (
        <g key={y}>
          <circle cx="28" cy={y + 2} r="2.4" fill={i === 1 ? theme.accent : theme.text3} opacity={i === 1 ? 1 : 0.4} />
          <rect x="34" y={y} width={i === 1 ? 26 : 30} height="4" rx="2" fill={theme.text3} opacity="0.35" />
        </g>
      ))}
      {/* recognized check on the correct row */}
      <motion.g
        initial={{ opacity: animate ? 0 : 1, scale: 1 }}
        animate={animate ? { opacity: [0, 0, 1, 1, 0], scale: [0.6, 0.6, 1.1, 1, 1] } : { opacity: 1 }}
        transition={animate ? { duration: 2.6, times: [0, 0.45, 0.6, 0.9, 1], repeat: Infinity, ease: 'easeOut' } : undefined}
        style={{ transformOrigin: '64px 36px' }}
      >
        <circle cx="64" cy="36" r="7" fill={theme.success} />
        <path d="M60.5 36 L63 38.5 L67.5 33.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      {/* sweeping scan line */}
      {animate && (
        <motion.rect
          x="20" width="52" height="3" rx="1.5" fill="url(#scanline)"
          initial={{ y: 12 }}
          animate={{ y: [12, 78, 12] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </svg>
  );
}

export default function MagicImportCard() {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialogRef = useFocusTrap(open, () => setOpen(false));
  useScrollLock(open);

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={calmMotion ? undefined : { scale: 1.01 }}
        whileTap={calmMotion ? undefined : { scale: 0.985 }}
        className="press-feedback relative w-full overflow-hidden rounded-[var(--r-xl)] p-5 text-left"
        style={{
          background: `linear-gradient(135deg, ${theme.accent}18, ${(theme.accent2 ?? theme.accent)}10)`,
          border: `1px solid ${theme.accent}40`,
          boxShadow: 'var(--elev-1)',
        }}
      >
        <span
          className="absolute right-4 top-4 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white"
          style={{ background: theme.accent }}
        >
          Nou
        </span>
        <div className="flex items-center gap-4">
          <ScanVisual animate={!calmMotion} />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black tracking-tight" style={{ color: theme.text }}>
              Fă o poză. Primești grile.
            </h3>
            <p className="mt-1 text-xs font-medium" style={{ color: theme.text2 }}>
              PDF · Word · poză · scan — recunosc întrebările și răspunsul corect, automat.
            </p>
            <span
              className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[11px] font-bold text-white"
              style={{ background: theme.accent }}
            >
              <Camera size={13} /> Începe acum
            </span>
          </div>
        </div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: t.modal }}
              exit={{ opacity: 0, transition: t.modalExit }}
              className="fixed inset-0 z-50"
              style={{ background: 'var(--overlay)', backdropFilter: 'blur(var(--blur-1))' }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
              exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
              className="fixed top-[6%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4"
            >
              <div
                className="rounded-[var(--r-lg)] p-6 max-h-[86vh] overflow-y-auto"
                style={{ background: theme.modalBg, border: `1px solid ${theme.border}`, boxShadow: 'var(--elev-4)' }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span id={titleId} className="text-sm font-bold" style={{ color: theme.text }}>Grile din document sau poză</span>
                  <button onClick={() => setOpen(false)} aria-label="Închide" className="rounded-[var(--r-sm)] p-1 focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]" style={{ color: theme.text3 }}><X size={14} aria-hidden="true" /></button>
                </div>
                <ImportFromDocument onDone={() => setOpen(false)} />
              </div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
}
