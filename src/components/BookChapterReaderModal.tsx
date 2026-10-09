import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Portal from './Portal';
import { motion } from 'framer-motion';
import { FileText, Image as ImageIcon, X } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import BookPdfReader, { type BookViewRequest } from './pdf/BookPdfReader';
import { canReadBookPdf } from './pdf/bridge';

interface Props {
  title: string;
  pageLabel?: string;
  /** Textul extras (modul text). Lipsește când se arată doar PDF-ul. */
  loading?: boolean;
  content?: string;
  onClose: () => void;
  /** Când e dat, capitolul se arată ca în PDF (pagini desenate); textul rămâne varianta de rezervă. */
  request?: BookViewRequest;
  /** Extrage textul capitolului, la cerere (când PDF-ul lipsește sau studentul trece pe „Text”). */
  loadText?: () => Promise<string>;
}

/** Full chapter reading view — mirrors KnowledgeVault.tsx's "Vizualizare document" modal chrome. */
export default function BookChapterReaderModal({ title, pageLabel, loading: loadingProp = false, content: contentProp = '', onClose, request, loadText }: Props) {
  const [mode, setMode] = useState<'pdf' | 'text'>(request && (canReadBookPdf() || !loadText) ? 'pdf' : 'text');
  const [lazy, setLazy] = useState<{ loading: boolean; content: string } | null>(() => (mode === 'text' && loadText ? { loading: true, content: '' } : null));
  const textRequested = useRef(false);
  const fetchText = useCallback(() => {
    if (!loadText || textRequested.current) return;
    textRequested.current = true;
    loadText().then(
      (text) => setLazy({ loading: false, content: text }),
      () => setLazy({ loading: false, content: 'Textul capitolului nu a putut fi extras.' }),
    );
  }, [loadText]);
  const loading = lazy ? lazy.loading : loadingProp;
  const content = lazy ? lazy.content : contentProp;
  const showText = useCallback(() => {
    setMode('text');
    if (loadText && !textRequested.current) setLazy({ loading: true, content: '' });
    fetchText();
  }, [loadText, fetchText]);
  // PDF-ul nu s-a găsit: trece automat pe text, dacă există.
  const onPdfUnavailable = useCallback(() => { if (loadText) showText(); }, [loadText, showText]);
  // Fără PDF de citit (varianta web sau fără cerere), textul extras e vizualizarea implicită.
  useEffect(() => { if (mode === 'text') fetchText(); }, [mode, fetchText]);

  const theme = useTheme();
  const { t } = useAdaptiveMotion();
  const titleId = useId();
  const dialogRef = useFocusTrap(true, onClose);
  useScrollLock(true);

  return (
    <Portal>
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: t.modal }}
        exit={{ opacity: 0, transition: t.modalExit }}
        onClick={onClose}
        className="fixed inset-0 z-[200] bg-[var(--overlay)]"
        style={{ backdropFilter: 'blur(var(--blur-1))' }}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
        exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
        className="premium-modal fixed inset-x-3 top-16 bottom-3 z-[201] mx-auto flex max-w-5xl flex-col overflow-hidden rounded-[var(--r-xl)] sm:inset-x-4 sm:top-20 sm:bottom-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 sm:px-6 sm:py-5" style={{ borderColor: theme.border }}>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text3 }}>
              {mode === 'pdf' ? 'Carte · pagini ca în PDF' : 'Cuprins'} {pageLabel ? `· ${pageLabel}` : ''}
            </div>
            <h2 id={titleId} className="mt-1 truncate text-2xl font-black tracking-tight" style={{ color: theme.text }}>{title}</h2>
          </div>
          <div className="flex items-center gap-2">
          {request && loadText && (
            <button
              type="button"
              onClick={() => (mode === 'pdf' ? showText() : setMode('pdf'))}
              className="fine-chip press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
              style={{ color: theme.text2 }}
            >
              {mode === 'pdf' ? <><FileText size={13} /> Text</> : <><ImageIcon size={13} /> Pagini PDF</>}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Închide"
            className="rounded-[var(--r-md)] p-2.5 focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text3 }}
          >
            <X size={18} />
          </button>
          </div>
        </div>
        {request && mode === 'pdf' ? (
          <div className="min-h-0 flex-1">
            <BookPdfReader request={request} onUnavailable={loadText ? onPdfUnavailable : undefined} />
          </div>
        ) : (
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton-block h-4 w-2/3 rounded-full" />
              <div className="skeleton-block h-4 w-full rounded-full" />
              <div className="skeleton-block h-4 w-5/6 rounded-full" />
              <div className="skeleton-block h-4 w-full rounded-full" />
            </div>
          ) : content ? (
            <div className="glass-panel rounded-[var(--r-xl)] p-6">
              <pre className="whitespace-pre-wrap break-words text-sm leading-7" style={{ color: theme.text, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
                {content}
              </pre>
            </div>
          ) : (
            <p className="text-sm" style={{ color: theme.text3 }}>
              Nu am putut localiza acest capitol în text.
            </p>
          )}
        </div>
        )}
      </motion.div>
    </>
    </Portal>
  );
}
