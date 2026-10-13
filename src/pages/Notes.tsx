import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { StickyNote, Search, Trash2, X, Sparkles, Loader2, CreditCard, ExternalLink, FileQuestion, HelpCircle, Filter } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useNotesStore } from '../store/notesStore';
import { useQuizStore } from '../store/quizStore';
import { useTutorialStore } from '../store/tutorialStore';
import { useAIStore } from '../store/aiStore';
import { notesToFlashcards, generateQuestionsFromText } from '../lib/groq';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { matchesQuery } from '../lib/searchText';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { plural } from '../lib/plural';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { dur, ease } from '../theme/motion';

type EnrichedNoteItem = {
  questionId: string;
  text: string;
  quiz: ReturnType<typeof useQuizStore.getState>['quizzes'][number] | null;
  question: ReturnType<typeof useQuizStore.getState>['quizzes'][number]['questions'][number] | null;
};

type FlatNoteItem =
  | {
      kind: 'header';
      id: string;
      quizId: string;
      quiz: EnrichedNoteItem['quiz'];
      count: number;
    }
  | {
      kind: 'note';
      id: string;
      note: EnrichedNoteItem;
      isFirstOverall: boolean;
    };

export default function Notes() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { calmMotion } = useAdaptiveMotion();
  const notes = useNotesStore((s) => s.notes);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const quizzes = useQuizStore((s) => s.quizzes);
  const addQuiz = useQuizStore((s) => s.addQuiz);
  const hasKey = useAIStore((s) => s.hasKey);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [aiConverting, setAiConverting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Căutarea și grila selectată trăiesc în URL (?q=&quiz=), ca să supraviețuiască reîncărcării.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const quizFilter = searchParams.get('quiz') ?? '';
  const updateParam = (key: 'q' | 'quiz', value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  // Build enriched notes list: questionId → { noteText, question, quiz }
  const enriched = useMemo(() => {
    return Object.entries(notes)
      .map(([questionId, text]) => {
        let quizFound = null;
        let questionFound = null;
        for (const quiz of quizzes) {
          const q = quiz.questions.find(q => q.id === questionId);
          if (q) { quizFound = quiz; questionFound = q; break; }
        }
        return { questionId, text, quiz: quizFound, question: questionFound };
      })
      .filter(n => n.text.trim().length > 0)
      .sort((a, b) => (a.quiz?.title ?? '').localeCompare(b.quiz?.title ?? '', 'ro'));
  }, [notes, quizzes]);

  const filtered = enriched.filter(n => {
    if (quizFilter && (n.quiz?.id ?? '__orphan__') !== quizFilter) return false;
    if (!search.trim()) return true;
    return matchesQuery(`${n.text} ${n.question?.text ?? ''} ${n.quiz?.title ?? ''}`, search);
  });
  const filterTitle = quizFilter
    ? (quizzes.find(q => q.id === quizFilter)?.title ?? (quizFilter === '__orphan__' ? 'Grilă ștearsă' : 'Grilă'))
    : '';

  // Group by quiz
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const n of filtered) {
      const key = n.quiz?.id ?? '__orphan__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return map;
  }, [filtered]);

  const parentRef = useRef<HTMLDivElement>(null);

  // Flatten grouped notes for dynamic height virtualization
  const flatItems = useMemo<FlatNoteItem[]>(() => {
    const items: FlatNoteItem[] = [];
    let isFirstOverall = true;
    for (const [quizId, noteList] of grouped.entries()) {
      const quiz = noteList[0]?.quiz ?? null;
      items.push({
        kind: 'header',
        id: `header-${quizId}`,
        quizId,
        quiz,
        count: noteList.length,
      });
      for (const note of noteList) {
        items.push({
          kind: 'note',
          id: `note-${note.questionId}`,
          note: note as EnrichedNoteItem,
          isFirstOverall,
        });
        isFirstOverall = false;
      }
    }
    return items;
  }, [grouped]);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (flatItems[index]?.kind === 'header' ? 44 : 160),
    overscan: 5,
    initialRect: { width: 1024, height: 800 },
    getItemKey: (index) => flatItems[index]?.id ?? index,
    measureElement: (element, entry, instance) => {
      if (entry?.borderBoxSize?.[0]?.blockSize) {
        return Math.round(entry.borderBoxSize[0].blockSize);
      }
      const measured = element.getBoundingClientRect().height || (element instanceof HTMLElement ? element.offsetHeight : 0);
      if (measured > 0) return measured;
      const index = instance.indexFromElement(element);
      return instance.options.estimateSize(index);
    },
    observeElementRect: (instance, cb) => {
      const element = instance.scrollElement;
      if (!element) return;
      const targetWindow = instance.targetWindow;
      const handler = () => {
        const rect = element.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : 1024;
        const height = rect.height > 0 ? rect.height : 800;
        cb({ width, height });
      };
      handler();
      let ro: ResizeObserver | null = null;
      if (typeof targetWindow !== 'undefined' && targetWindow?.ResizeObserver) {
        ro = new targetWindow.ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry?.borderBoxSize?.[0]) {
            const box = entry.borderBoxSize[0];
            const width = box.inlineSize > 0 ? Math.round(box.inlineSize) : 1024;
            const height = box.blockSize > 0 ? Math.round(box.blockSize) : 800;
            cb({ width, height });
          } else {
            handler();
          }
        });
        ro.observe(element, { box: 'border-box' });
      }
      targetWindow?.addEventListener('resize', handler, { passive: true });
      return () => {
        ro?.disconnect();
        targetWindow?.removeEventListener('resize', handler);
      };
    },
  });

  // Scroll to top when search query or quiz filter changes
  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = 0;
    }
    rowVirtualizer.scrollToOffset(0);
  }, [search, quizFilter]);

  // Ensure first item is mounted and in view when tutorial runs or step changes
  const activeTour = useTutorialStore((s) => s.activeTour);
  const currentStep = useTutorialStore((s) => s.currentStep);
  useEffect(() => {
    if (activeTour === 'notes') {
      if (parentRef.current) {
        parentRef.current.scrollTop = 0;
      }
      rowVirtualizer.scrollToOffset(0);
    }
  }, [activeTour, currentStep]);

  const runConversion = async (kind: 'quiz' | 'flashcards') => {
    setAiError(null);
    setAiConverting(true);
    try {
      const allText = filtered
        .map(n => `Q: ${n.question?.text ?? 'Întrebare'}\nNotiță: ${n.text}`)
        .join('\n\n');
      if (kind === 'quiz') {
        const questions = await generateQuestionsFromText(allText, 10, 3, []);
        if (questions.length === 0) throw new Error('Nu s-au generat întrebări.');
        const newQuiz = {
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          title: 'Quiz din Notițe',
          description: `Generat automat din ${plural(filtered.length, 'notiță', 'notițe')}`,
          emoji: '📝',
          color: 'blue' as const,
          category: 'Notițe',
          kind: 'quiz' as const,
          tags: ['ai-quiz', 'notițe'],
          questions: questions.map(q => ({
            ...q,
            id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            options: q.options.map((o, i) => ({
              ...o,
              id: `o-${Math.random().toString(36).slice(2, 7)}-${i}`,
            })),
          })),
          createdAt: Date.now(),
        };
        addQuiz(newQuiz);
        navigate(`/quiz/${newQuiz.id}`);
      } else {
        const pairs = await notesToFlashcards(allText);
        if (pairs.length === 0) throw new Error('Nu s-au generat flashcarduri.');
        const newQuiz = {
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          title: 'Flashcarduri din notițe',
          description: `Generat automat din ${plural(filtered.length, 'notiță', 'notițe')}`,
          emoji: '🃏',
          color: 'purple' as const,
          category: 'Notițe',
          kind: 'flashcard' as const,
          tags: ['flashcard', 'notițe'],
          questions: pairs.map((p, i) => ({
            id: `fc-${i}-${Date.now()}`,
            text: p.front,
            options: [{ id: 'a', text: p.back, isCorrect: true }],
            explanation: p.back,
            tags: ['flashcard', 'notițe'],
          })),
          createdAt: Date.now(),
        };
        addQuiz(newQuiz);
        navigate(`/flashcards/session/${newQuiz.id}?mode=all`);
      }
    } catch (e: unknown) {
      setAiError(friendlyAIError(e));
    } finally {
      setAiConverting(false);
    }
  };

  const spinner = calmMotion ? '' : 'animate-spin';

  return (
    <div ref={parentRef} className="h-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
      <div className="max-w-4xl mx-auto">

        <PageHeader
          eyebrow="Biblioteca ta"
          title="Notițele mele"
          tour={{ id: 'notes', label: 'Ghid pentru notițe' }}
          subtitle={enriched.length === 0
            ? 'Nicio notiță salvată'
            : `${enriched.length} ${enriched.length === 1 ? 'notiță' : 'notițe'} din ${grouped.size} ${grouped.size === 1 ? 'grilă' : 'grile'}`}
          actions={enriched.length > 0 && hasKey ? (
            <>
              <button
                data-tutorial="notes-ai-quiz"
                disabled={aiConverting}
                onClick={() => runConversion('quiz')}
                className="press-feedback fx-lift focus-ring flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold"
                style={{
                  background: aiConverting ? theme.surface2 : `${theme.accent}15`,
                  color: aiConverting ? theme.text3 : theme.accentText,
                  border: `1px solid ${aiConverting ? theme.border : `${theme.accent}30`}`,
                }}>
                {aiConverting
                  ? <><Loader2 size={13} className={spinner} />Generez...</>
                  : <><Sparkles size={13} /> Grilă AI</>}
              </button>
              <button
                data-tutorial="notes-ai-flashcards"
                disabled={aiConverting}
                onClick={() => runConversion('flashcards')}
                className="press-feedback fx-lift focus-ring flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold"
                style={{
                  background: aiConverting ? theme.surface2 : theme.accent,
                  color: aiConverting ? theme.text3 : '#fff',
                  border: `1px solid ${aiConverting ? theme.border : 'transparent'}`,
                }}>
                {aiConverting
                  ? <><Loader2 size={13} className={spinner} />Generez...</>
                  : <><CreditCard size={13} />AI Flashcarduri</>}
              </button>
            </>
          ) : undefined}
        />
        {aiError && (
          <p role="alert" className="-mt-3 mb-4 text-xs" style={{ color: theme.danger }}>{aiError}</p>
        )}

        {/* Search */}
        {enriched.length > 0 && (
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: theme.text3 }} aria-hidden="true" />
            <input
              data-tutorial="notes-search"
              type="text"
              aria-label="Caută în notițe"
              placeholder="Caută în notițe..."
              value={search}
              onChange={e => updateParam('q', e.target.value)}
              className="focus-ring elev-1 w-full rounded-[var(--r-lg)] py-3 pl-10 pr-10 text-sm"
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                outline: 'none',
                boxShadow: 'var(--elev-1)',
              }}
            />
            {search && (
              <button onClick={() => updateParam('q', '')}
                aria-label="Șterge căutarea"
                className="fine-row press-feedback absolute right-3 top-1/2 -translate-y-1/2 p-1"
                style={{ color: theme.text3 }}>
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {quizFilter && (
          <div className="mb-4 flex">
            <button
              onClick={() => updateParam('quiz', '')}
              aria-label={`Elimină filtrul pe grila ${filterTitle}`}
              className="fine-chip press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
              style={{ color: theme.accentText, background: `${theme.accent}15` }}>
              <Filter size={12} aria-hidden="true" />
              {filterTitle}
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Empty state */}
        {enriched.length === 0 && (
          <EmptyState
            icon={StickyNote}
            title="Nicio notiță încă"
            body="Adaugă notițe personale în timp ce rezolvi grile. Apar după ce răspunzi la o întrebare."
            primary={{ label: 'Deschide o grilă', to: '/quizzes' }}
          />
        )}

        {/* No search results */}
        {enriched.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={Search}
            title="Nicio notiță nu corespunde"
            body="Încearcă alte cuvinte sau scoate filtrele active."
            primary={{ label: 'Șterge filtrele', onClick: () => setSearchParams({}, { replace: true }) }}
          />
        )}

        {/* Notes grouped by quiz - Virtualized */}
        {flatItems.length > 0 && (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              if (!item) return null;

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="pb-3"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.kind === 'header' ? (
                    <div className="flex items-center gap-2 pt-2 mb-1">
                      {item.quiz ? (
                        <Link
                          to={`/quiz/${item.quiz.id}`}
                          className="group focus-ring inline-flex items-center gap-2 rounded-[var(--r-sm)] transition-opacity hover:opacity-90"
                          style={{ color: theme.accentText }}
                        >
                          <span className="text-lg select-none leading-none" aria-hidden="true">{item.quiz.emoji}</span>
                          <span className="font-semibold text-sm underline-offset-4 decoration-1 group-hover:underline">{item.quiz.title}</span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2" style={{ color: theme.text3 }}>
                          <FileQuestion size={14} />
                          <span className="font-semibold text-sm">Grilă ștearsă</span>
                        </div>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: theme.surface2, color: theme.text3 }}>
                        {item.count}
                      </span>
                      {!quizFilter && grouped.size > 1 && (
                        <button
                          onClick={() => updateParam('quiz', item.quizId)}
                          aria-label={`Arată doar notițele din ${item.quiz?.title ?? 'grila ștearsă'}`}
                          title="Arată doar această grilă"
                          className="fine-row press-feedback ml-auto p-1.5"
                          style={{ color: theme.text3 }}>
                          <Filter size={13} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      {...(item.isFirstOverall ? { 'data-tutorial': 'notes-entry' } : {})}
                      className="glass-panel rounded-[var(--r-lg)] p-4 sm:p-5"
                    >
                      {/* Keep the question, personal note and actions in separate visual rows. */}
                      {item.note.question && (
                        <div className="mb-3">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.text3 }}>
                            <HelpCircle size={12} aria-hidden="true" /> Întrebare
                          </div>
                          <p className="question-body text-sm font-semibold leading-relaxed" style={{ color: theme.text }}>
                            {item.note.question.text}
                          </p>
                        </div>
                      )}

                      {item.note.question && <div className="mb-3 h-px" style={{ background: theme.border }} />}

                      <p className="note-body text-sm whitespace-pre-wrap break-words leading-relaxed" style={{ color: theme.text2 }}>
                        {item.note.text}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: theme.border }}>
                        {item.note.quiz && item.note.question ? (
                          <Link
                            to={`/play/${encodeURIComponent(item.note.quiz.id)}?question=${encodeURIComponent(item.note.questionId)}`}
                            title="Deschide această întrebare"
                            aria-label={`Deschide întrebarea: ${item.note.question.text}`}
                            className="press-feedback focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1.5 text-xs font-semibold"
                            style={{ color: theme.accentText, background: `${theme.accent}12` }}
                          >
                            <ExternalLink size={13} aria-hidden="true" /> Deschide întrebarea
                          </Link>
                        ) : <span />}
                        <AnimatePresence mode="wait">
                        {confirmDelete === item.note.questionId ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: dur.fast, ease: ease.snap }}
                            role="group"
                            aria-label="Confirmă ștergerea notiței"
                            className="flex items-center gap-2"
                          >
                            <span className="text-xs font-medium" style={{ color: theme.text2 }}>Ștergi notița?</span>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="fine-chip press-feedback px-3 py-1.5 rounded-[var(--r-sm)] text-xs font-semibold"
                              style={{ color: theme.text2 }}>
                              Anulează
                            </button>
                            <button
                              onClick={() => { deleteNote(item.note.questionId); setConfirmDelete(null); }}
                              className="press-feedback px-3 py-1.5 rounded-[var(--r-sm)] text-xs font-semibold text-white transition-[filter] duration-300 hover:brightness-110"
                              style={{ background: theme.danger }}>
                              Șterge
                            </button>
                          </motion.div>
                        ) : (
                          <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: dur.fast }}
                            onClick={() => setConfirmDelete(item.note.questionId)}
                            title="Șterge notița"
                            aria-label="Șterge notița"
                            className="focus-ring p-1.5 rounded-[var(--r-sm)] opacity-70 hover:opacity-100 transition-opacity"
                            style={{ color: theme.text3 }}>
                            <Trash2 size={13} />
                          </motion.button>
                        )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
