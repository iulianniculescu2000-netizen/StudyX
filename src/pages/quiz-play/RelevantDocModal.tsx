import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, X, ExternalLink, Bookmark, Check } from 'lucide-react';
import type { RetrievedChunk } from '../../ai/types';
import { useTheme } from '../../theme/ThemeContext';
import { dur, ease } from '../../theme/motion';
import { dispatchOpenBook } from '../../components/pdf/bookRequest';
import type { BookCode } from '../../lib/bookPages';
import { formatRelevantDoc } from './relevantDocFormatting';

interface Props {
  open: boolean;
  chunk: RetrievedChunk | null;
  onClose: () => void;
}

function detectCurriculumBook(sourceName: string): BookCode | null {
  const lower = sourceName.toLowerCase();
  if (lower.includes('kumar')) return 'K';
  if (lower.includes('lawrence')) return 'L';
  if (lower.includes('sinopsis') || lower.includes('schwartz')) return 'S';
  return null;
}

export default function RelevantDocModal({ open, chunk, onClose }: Props) {
  const theme = useTheme();
  const textBlocks = useMemo(() => formatRelevantDoc(chunk?.text ?? ''), [chunk?.text]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !chunk) return null;

  const bookCode = detectCurriculumBook(chunk.source);
  const hasBookPage = typeof chunk.page === 'number' || typeof chunk.printedPage === 'number';
  const canOpenPdf = Boolean(bookCode && hasBookPage);

  const handleOpenPdf = () => {
    if (!bookCode) return;
    onClose();
    dispatchOpenBook({
      book: bookCode,
      printedPage: chunk.printedPage,
      pdfPage: chunk.page,
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: dur.fast, ease: ease.standard }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: dur.base, ease: ease.emphasized }}
          role="dialog"
          aria-modal="true"
          className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-[var(--r-xl)] glass-panel overflow-hidden shadow-2xl"
          style={{
            background: theme.modalBg,
            borderColor: theme.border2,
            boxShadow: 'var(--elev-4)',
          }}
        >
          {/* Antet Modal */}
          <div
            className="flex items-start justify-between p-5 border-b"
            style={{ borderColor: theme.border }}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="p-2.5 rounded-[var(--r-md)] flex-shrink-0"
                style={{ background: `${theme.accent}15`, color: theme.accentText }}
              >
                <BookOpen size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[16px] font-bold truncate" style={{ color: theme.text }}>
                    {chunk.source}
                  </h3>
                  <span
                    className="fine-chip text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: `${theme.accent}15`, color: theme.accentText }}
                  >
                    Document relevant
                  </span>
                </div>
                <p className="text-[12.5px] mt-0.5 truncate" style={{ color: theme.text3 }}>
                  {[
                    chunk.chapter || chunk.heading,
                    chunk.printedPage
                      ? `Pagina ${chunk.printedPage}`
                      : chunk.page
                      ? `Pagina ${chunk.page}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Închide fereastra"
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0 ml-2"
              style={{ color: theme.text3 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Corp Modal — Fragmentul de text */}
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
            <div
              className="p-4 rounded-[var(--r-md)] border text-[14px] leading-relaxed select-text"
              style={{
                background: theme.surface2,
                borderColor: theme.border,
                color: theme.text,
              }}
            >
              <div className="flex items-center gap-1.5 mb-2 text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: theme.accentText }}>
                <Bookmark size={13} />
                <span>Fragment extras din bibliografie</span>
              </div>
              <article className="mx-auto max-w-[72ch] space-y-4 break-words font-sans leading-7">
                {textBlocks.map((block, index) => block.kind === 'heading' ? (
                  <h4 key={index} className="pt-2 text-[13px] font-extrabold uppercase tracking-[0.08em]" style={{ color: theme.text }}>
                    {block.text}
                  </h4>
                ) : block.kind === 'list' ? (
                  <ul key={index} className="space-y-1.5 pl-4" role="list">
                    {block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{item}</li>)}
                  </ul>
                ) : (
                  <p key={index}>{block.text}</p>
                ))}
              </article>
            </div>
            
            <p className="text-[12px] italic text-center" style={{ color: theme.text3 }}>
              💡 Sesiunea de examinare rămâne activă. La închiderea acestui panou continui grila exact de unde ai rămas.
            </p>
          </div>

          {/* Subsol Modal */}
          <div
            className="flex items-center justify-between p-4 border-t gap-3"
            style={{ borderColor: theme.border, background: theme.surface }}
          >
            <div>
              {canOpenPdf && (
                <button
                  type="button"
                  onClick={handleOpenPdf}
                  className="fine-chip press-feedback flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors"
                  style={{ color: theme.accentText }}
                >
                  <ExternalLink size={14} />
                  <span>Deschide în manualul PDF</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="press-feedback flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-semibold text-white shadow-sm transition-[filter] hover:brightness-110"
              style={{ background: theme.accent }}
            >
              <Check size={15} />
              <span>Continuă grila</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
