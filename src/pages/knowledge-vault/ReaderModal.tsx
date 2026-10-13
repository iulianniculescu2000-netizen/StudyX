import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, FileText, Layers3, X } from 'lucide-react';
import { isSourceReady, type AIKnowledgeSource } from '../../store/aiStore';
import { useTheme } from '../../theme/ThemeContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { SourceChapter } from '../../hooks/useSourceChapters';
import { dur, ease } from '../../theme/motion';
import { useSidebarInset } from '../../components/ai-chat/useSidebarInset';

interface ReaderModalProps {
  open: boolean;
  source: AIKnowledgeSource | null;
  loading: boolean;
  content: string;
  chapters: SourceChapter[];
  onClose: () => void;
  onAsk: (source: AIKnowledgeSource) => void;
  onOpenStudio: (source: AIKnowledgeSource) => void;
  onGenerateFromChapter: (heading: string, label: string) => void;
}

export default function ReaderModal({
  open, source, loading, content, chapters, onClose, onAsk, onOpenStudio, onGenerateFromChapter,
}: ReaderModalProps) {
  const theme = useTheme();
  const readerRef = useFocusTrap(open, onClose);
  // The panel is centred in the space right of the sidebar, not in the whole window (the sidebar would cover its left edge).
  const sidebarInset = useSidebarInset(open);
  return (
    <AnimatePresence>
      {open && source && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-[var(--overlay)]"
            style={{ backdropFilter: 'blur(var(--blur-1))' }}
          />
          <motion.div
            ref={readerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Vizualizare document: ${source.name}`}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: dur.base, ease: ease.emphasized } }}
            exit={{ opacity: 0, y: 8, scale: 0.985, transition: { duration: 0.16, ease: ease.snap } }}
            style={{ left: sidebarInset + 12, right: 12 }}
            className="premium-modal fixed inset-x-3 top-16 bottom-3 z-[60] mx-auto flex max-w-5xl flex-col overflow-hidden rounded-[var(--r-xl)] sm:inset-x-4 sm:top-20 sm:bottom-4 sm:rounded-[var(--r-xl)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 sm:px-6 sm:py-5" style={{ borderColor: theme.border }}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="elev-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--r-md)]" style={{ background: 'var(--accent-soft)', color: theme.accent }}>
                  <FileText size={20} />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text3 }}>Vizualizare document</div>
                  <h2 className="mt-1 truncate text-2xl font-black tracking-tight leading-normal" style={{ color: theme.text }}>{source.name}</h2>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                <button
                  onClick={() => isSourceReady(source) && onAsk(source)}
                  disabled={!isSourceReady(source)}
                  className="fine-chip press-feedback flex-1 rounded-[var(--r-md)] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] sm:flex-none"
                  style={{ background: 'var(--accent-soft)', color: theme.accentText, opacity: isSourceReady(source) ? 1 : 0.45 }}
                >
                  Întreabă AI <ArrowRight size={14} className="ml-1 inline-block" />
                </button>
                <button
                  onClick={() => isSourceReady(source) && onOpenStudio(source)}
                  disabled={source.indexStatus !== 'ready'}
                  className="fine-chip press-feedback flex-1 rounded-[var(--r-md)] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] sm:flex-none"
                  style={{ color: theme.text2, opacity: source.indexStatus === 'ready' ? 1 : 0.45 }}
                >
                  AI Studio
                </button>
                <button
                  onClick={onClose}
                  className="fine-chip press-feedback rounded-[var(--r-md)] p-2.5"
                  style={{ color: theme.text3 }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
              {loading ? (
                <div className="space-y-3">
                  <div className="skeleton-block h-4 w-2/3 rounded-full" />
                  <div className="skeleton-block h-4 w-full rounded-full" />
                  <div className="skeleton-block h-4 w-5/6 rounded-full" />
                </div>
              ) : (
                <>
                  {isSourceReady(source) && chapters.length > 0 && (
                    <div className="glass-panel mb-5 rounded-[var(--r-xl)] p-5">
                      <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: theme.text3 }}>
                        <Layers3 size={13} /> Capitole detectate
                      </div>
                      <div className="space-y-2">
                        {chapters.map((chapter) => (
                          <div
                            key={chapter.heading}
                            className="glass-panel flex items-center justify-between gap-3 rounded-[var(--r-md)] px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold" style={{ color: theme.text }}>{chapter.label}</div>
                              <div className="text-[11px] font-medium" style={{ color: theme.text3 }}>{chapter.chunkCount} fragmente indexate</div>
                            </div>
                            <button
                              onClick={() => onGenerateFromChapter(chapter.heading, chapter.label)}
                              className="fine-chip press-feedback flex-shrink-0 rounded-[var(--r-sm)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em]"
                              style={{ background: 'var(--accent-soft)', color: theme.accentText }}
                            >
                              Generează grile
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="glass-panel rounded-[var(--r-xl)] p-6">
                    <pre className="whitespace-pre-wrap break-words text-sm leading-7" style={{ color: theme.text, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
                      {content}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
