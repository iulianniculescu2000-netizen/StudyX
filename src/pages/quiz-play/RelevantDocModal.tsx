import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, X, ExternalLink, Bookmark, Check } from 'lucide-react';
import type { RetrievedChunk } from '../../ai/types';
import { useTheme } from '../../theme/ThemeContext';
import { dur, ease } from '../../theme/motion';
import { dispatchOpenBook } from '../../components/pdf/bookRequest';
import type { BookCode } from '../../lib/bookPages';
import { formatRelevantDoc } from './relevantDocFormatting';
import { foldText, type BookPassage, type HighlightRole, type PassageHighlight } from '../../lib/bookPassage';
import { HIGHLIGHT_LEGEND } from '../../lib/bookAgent/prompts';

interface Props {
  open: boolean;
  chunk: RetrievedChunk | null;
  /** Pasajul curat din cărțile incluse; are prioritate față de `chunk` (textul OCR din bibliotecă). */
  passage?: BookPassage | null;
  onClose: () => void;
}

/** Culorile evidențierilor pe roluri (fundal + subliniere, ca să nu depindă doar de culoare). */
function roleColors(theme: { success: string; accent: string; warning: string }): Record<HighlightRole, string> {
  return { answer: theme.success, question: theme.accent, distractor: theme.warning };
}

/** Textul cu propozițiile evidențiate, fiecare în culoarea rolului ei (potrivire fără diacritice și majuscule; textul rămâne cel din carte). */
function withMarks(text: string, highlights: readonly PassageHighlight[], colors: Record<HighlightRole, string>) {
  if (highlights.length === 0) return text;
  const folded = foldText(text);
  const spans: Array<{ start: number; end: number; role: HighlightRole }> = [];
  for (const { quote, role } of highlights) {
    const needle = foldText(quote).replace(/\s+/g, ' ').trim();
    const at = needle ? folded.indexOf(needle) : -1;
    if (at >= 0) spans.push({ start: at, end: at + needle.length, role });
  }
  if (spans.length === 0) return text;
  spans.sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach(({ start, end, role }, index) => {
    if (start < cursor) return;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={index}
        data-role={role}
        title={HIGHLIGHT_LEGEND[role]}
        className="rounded-sm px-0.5"
        style={{ background: `${colors[role]}2e`, color: 'inherit', borderBottom: `2px solid ${colors[role]}` }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function detectCurriculumBook(sourceName: string): BookCode | null {
  const lower = sourceName.toLowerCase();
  if (lower.includes('kumar')) return 'K';
  if (lower.includes('lawrence')) return 'L';
  if (lower.includes('sinopsis') || lower.includes('schwartz')) return 'S';
  return null;
}

export default function RelevantDocModal({ open, chunk, passage = null, onClose }: Props) {
  const theme = useTheme();
  const titleId = useId();
  const textBlocks = useMemo(() => (passage ? passage.blocks : formatRelevantDoc(chunk?.text ?? '')), [passage, chunk?.text]);
  const highlights = passage?.highlights ?? [];
  const colors = roleColors(theme);
  const articleRef = useRef<HTMLElement>(null);
  const usedRoles = (['answer', 'question', 'distractor'] as const).filter((role) => highlights.some((item) => item.role === role));

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

  // Pasajul se deschide cu prima propoziție evidențiată în câmpul vizual.
  useEffect(() => {
    if (!open || !passage) return;
    const frame = requestAnimationFrame(() => articleRef.current?.querySelector('mark')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [open, passage]);

  if (!open || (!chunk && !passage)) return null;

  const sourceName = passage?.source ?? chunk?.source ?? '';
  const bookCode = passage?.book ?? detectCurriculumBook(sourceName);
  const hasBookPage = passage ? true : typeof chunk?.page === 'number' || typeof chunk?.printedPage === 'number';
  const canOpenPdf = Boolean(bookCode && hasBookPage);

  const handleOpenPdf = () => {
    if (!bookCode) return;
    onClose();
    dispatchOpenBook({
      book: bookCode,
      printedPage: passage ? undefined : chunk?.printedPage,
      pdfPage: passage ? passage.page : chunk?.page,
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
          aria-labelledby={titleId}
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
                  <h3 id={titleId} className="text-[16px] font-bold truncate" style={{ color: theme.text }}>
                    {sourceName}
                  </h3>
                  <span
                    className="fine-chip text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: `${theme.accent}15`, color: theme.accentText }}
                  >
                    {passage ? (passage.verified ? 'Pasaj verificat' : 'Pasaj posibil relevant') : 'Document relevant'}
                  </span>
                </div>
                <p className="text-[12.5px] mt-0.5 truncate" style={{ color: theme.text3 }}>
                  {(passage
                    ? [passage.chapter, passage.topic ?? passage.heading, `Pagina ${passage.page}`]
                    : [
                      chunk?.chapter || chunk?.heading,
                      chunk?.printedPage ? `Pagina ${chunk.printedPage}` : chunk?.page ? `Pagina ${chunk.page}` : null,
                    ])
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
                <span>{passage ? 'Din carte' : 'Fragment extras din bibliografie'}</span>
              </div>
              {passage?.why && (
                <p className="mx-auto mb-3 max-w-[72ch] text-[13px] leading-6" style={{ color: theme.text2 }}>{passage.why}</p>
              )}
              {usedRoles.length > 0 && (
                <ul className="mx-auto mb-3 flex max-w-[72ch] flex-wrap gap-x-4 gap-y-1.5 text-[12px]" style={{ color: theme.text2 }} aria-label="Legenda evidențierilor">
                  {usedRoles.map((role) => (
                    <li key={role} className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: `${colors[role]}2e`, borderBottom: `2px solid ${colors[role]}` }} aria-hidden="true" />
                      {HIGHLIGHT_LEGEND[role]}
                    </li>
                  ))}
                </ul>
              )}
              <article ref={articleRef} className="mx-auto max-w-[72ch] space-y-4 break-words font-sans leading-7">
                {textBlocks.map((block, index) => block.kind === 'heading' ? (
                  <h4 key={index} className="pt-2 text-[13px] font-extrabold uppercase tracking-[0.08em]" style={{ color: theme.text }}>
                    {block.text}
                  </h4>
                ) : block.kind === 'list' ? (
                  <ul key={index} className="list-disc space-y-1.5 pl-6" role="list">
                    {block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{withMarks(item, highlights, colors)}</li>)}
                  </ul>
                ) : (
                  <p key={index}>{withMarks(block.text, highlights, colors)}</p>
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
