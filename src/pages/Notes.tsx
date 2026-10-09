import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { StickyNote, Search, Trash2, X, Sparkles, Loader2, CreditCard, ExternalLink, FileQuestion, HelpCircle, Filter } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useNotesStore } from '../store/notesStore';
import { useQuizStore } from '../store/quizStore';
import { useAIStore } from '../store/aiStore';
import { notesToFlashcards, generateQuestionsFromText } from '../lib/groq';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { matchesQuery } from '../lib/searchText';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { dur, ease } from '../theme/motion';

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
          description: `Generat automat din ${filtered.length} notițe`,
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
          description: `Generat automat din ${filtered.length} notițe`,
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
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
      <div className="max-w-4xl mx-auto">

        <PageHeader
          eyebrow="Biblioteca ta"
          title="Notițele mele"
          help="page-notes"
          subtitle={enriched.length === 0
            ? 'Nicio notiță salvată'
            : `${enriched.length} ${enriched.length === 1 ? 'notiță' : 'notițe'} din ${grouped.size} ${grouped.size === 1 ? 'grilă' : 'grile'}`}
          actions={enriched.length > 0 && hasKey ? (
            <>
              <button
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

        {/* Notes grouped by quiz */}
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([quizId, noteList], gi) => {
            const quiz = noteList[0]?.quiz;
            return (
              <motion.div
                key={quizId}
                initial={calmMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: dur.base, ease: ease.standard, delay: Math.min(gi, 8) * 0.04 }}
              >
                {/* Quiz header */}
                <div className="flex items-center gap-2 mb-3">
                  {quiz ? (
                    <Link to={`/quiz/${quiz.id}`}
                      className="flex items-center gap-2 hover:underline"
                      style={{ color: theme.accentText }}>
                      <span className="text-lg">{quiz.emoji}</span>
                      <span className="font-semibold text-sm">{quiz.title}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2" style={{ color: theme.text3 }}>
                      <FileQuestion size={14} />
                      <span className="font-semibold text-sm">Grilă ștearsă</span>
                    </div>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: theme.surface2, color: theme.text3 }}>
                    {noteList.length}
                  </span>
                  {!quizFilter && grouped.size > 1 && (
                    <button
                      onClick={() => updateParam('quiz', quizId)}
                      aria-label={`Arată doar notițele din ${quiz?.title ?? 'grila ștearsă'}`}
                      title="Arată doar această grilă"
                      className="fine-row press-feedback ml-auto p-1.5"
                      style={{ color: theme.text3 }}>
                      <Filter size={13} />
                    </button>
                  )}
                </div>

                {/* Notes cards */}
                <div className="space-y-3">
                  {noteList.map((n) => (
                    <div
                      key={n.questionId}
                      className="group glass-panel rounded-[var(--r-lg)] p-4 relative"
                    >
                      {/* Question text + link to quiz detail */}
                      {n.question && (
                        <div className="flex items-start gap-2 mb-2 pr-6">
                          <p className="text-xs font-medium line-clamp-2 flex-1"
                            style={{ color: theme.text3 }}>
                            <HelpCircle size={12} className="inline-block align-text-bottom mr-1" />{n.question.text}
                          </p>
                          {n.quiz && (
                            <Link
                              to={`/quiz/${n.quiz.id}`}
                              title="Deschide grila"
                              aria-label="Deschide grila"
                              className="flex-shrink-0 p-1 rounded-[var(--r-sm)] opacity-60 hover:opacity-100 transition-opacity"
                              style={{ color: theme.accentText }}
                            >
                              <ExternalLink size={11} />
                            </Link>
                          )}
                        </div>
                      )}

                      <div style={{ height: 1, background: theme.border, marginBottom: 8 }} />

                      <p className="text-sm whitespace-pre-wrap pr-16" style={{ color: theme.text }}>
                        {n.text}
                      </p>

                      {/* Delete button */}
                      <AnimatePresence>
                        {confirmDelete === n.questionId ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: dur.fast, ease: ease.snap }}
                            className="absolute top-3 right-3 flex items-center gap-1"
                          >
                            <button
                              onClick={() => { deleteNote(n.questionId); setConfirmDelete(null); }}
                              className="press-feedback px-2 py-1 rounded-[var(--r-sm)] text-xs font-semibold text-white transition-[filter] duration-300 hover:brightness-110"
                              style={{ background: theme.danger }}>
                              Șterge
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="fine-chip press-feedback px-2 py-1 rounded-[var(--r-sm)] text-xs"
                              style={{ color: theme.text3 }}>
                              Nu
                            </button>
                          </motion.div>
                        ) : (
                          <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: dur.fast }}
                            onClick={() => setConfirmDelete(n.questionId)}
                            title="Șterge notița"
                            aria-label="Șterge notița"
                            className="absolute top-3 right-3 p-1.5 rounded-[var(--r-sm)] opacity-40 hover:opacity-100 group-hover:opacity-100 transition-opacity"
                            style={{ color: theme.text3 }}>
                            <Trash2 size={13} />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
