import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Plus, Filter, X, ArrowUpDown, Archive, Tag, BookOpen, Sparkles } from 'lucide-react';
import { useQuizStore } from '../store/quizStore';
import { isRezidentiatQuiz } from '../lib/rezidentiatBank';
import { useTheme } from '../theme/ThemeContext';
import QuizCard from '../components/QuizCard';
import ImportQuizButton from '../components/ImportQuizButton';
import PremiumSelect from '../components/PremiumSelect';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import PageSkeleton from '../components/ui/PageSkeleton';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import { matchesQuery } from '../lib/searchText';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { dur, ease } from '../theme/motion';

type SortOption = 'newest' | 'oldest' | 'name_az' | 'name_za' | 'most_questions' | 'best_score';

const SORT_VALUES: readonly SortOption[] = ['newest', 'oldest', 'name_az', 'name_za', 'most_questions', 'best_score'];
const ALL_CATEGORIES = 'Toate';

export default function QuizList() {
  const quizzes = useQuizStore((s) => s.quizzes);
  const sessions = useQuizStore((s) => s.sessions);
  const hydrated = useStoresHydrated('quiz');
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const importRef = useRef<HTMLDivElement>(null);
  const [showArchived, setShowArchived] = useState(false);
  const ITEMS_PER_PAGE = 12;

  // Filtrele trăiesc în URL (?q=&cat=&sort=&tag=), ca să supraviețuiască navigării înapoi.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const category = params.get('cat') || ALL_CATEGORIES;
  const rawSort = params.get('sort');
  const sort: SortOption = SORT_VALUES.includes(rawSort as SortOption) ? (rawSort as SortOption) : 'newest';
  const activeTag = params.get('tag') || null;
  // Paginarea e legată de cheia filtrelor: la orice schimbare de filtre revine la prima pagină.
  const filterKey = `${search}|${category}|${sort}|${activeTag ?? ''}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const loadMore = () => setPageState({ key: filterKey, page: page + 1 });

  const updateFilter = useCallback((patch: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key); else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setParams]);
  const setSearch = (value: string) => updateFilter({ q: value });
  const setCategory = (value: string) => updateFilter({ cat: value === ALL_CATEGORIES ? null : value });
  const setSort = (value: SortOption) => updateFilter({ sort: value === 'newest' ? null : value });
  const setActiveTag = (value: string | null) => updateFilter({ tag: value });

  // Rezidențiat content (the real Lawrence+Kumar bank, and any AI-generated
  // packs from Rezidențiat book chapters) lives only in the Rezidențiat page —
  // "Toate grilele" is exclusively the year's coursework materii, so it stays
  // a clean, undiluted subject list instead of a mix of the two.
  const activeQuizzes = quizzes.filter(q => !q.archived && !isRezidentiatQuiz(q));
  const archivedQuizzes = quizzes.filter(q => q.archived && !isRezidentiatQuiz(q));

  const categories = useMemo(() => 
    ['Toate', ...Array.from(new Set(activeQuizzes.map((q) => q.category).filter(Boolean))).sort()],
    [activeQuizzes]
  );

  const bestScoreByQuiz = useMemo(() => {
    const scores = new Map<string, number>();
    for (const session of sessions) {
      const score = Math.round((session.score / session.total) * 100);
      const previous = scores.get(session.quizId) ?? 0;
      if (score > previous) scores.set(session.quizId, score);
    }
    return scores;
  }, [sessions]);

  const sortFn = (a: typeof quizzes[0], b: typeof quizzes[0]) => {
    switch (sort) {
      case 'newest': return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
      case 'oldest': return (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt);
      case 'name_az': return a.title.localeCompare(b.title, 'ro');
      case 'name_za': return b.title.localeCompare(a.title, 'ro');
      case 'most_questions': return b.questions.length - a.questions.length;
      case 'best_score': return (bestScoreByQuiz.get(b.id) ?? 0) - (bestScoreByQuiz.get(a.id) ?? 0);
      default: return 0;
    }
  };

  const allTags = useMemo(() => 
    Array.from(new Set(activeQuizzes.flatMap(q => q.tags ?? []))).sort(),
    [activeQuizzes]
  );

  const filtered = activeQuizzes.filter((q) => {
    const matchSearch = matchesQuery(`${q.title} ${q.description} ${q.category ?? ''} ${(q.tags ?? []).join(' ')}`, search);
    const matchCategory = category === 'Toate' || q.category === category;
    const matchTag = !activeTag || (q.tags ?? []).includes(activeTag);
    return matchSearch && matchCategory && matchTag;
  }).sort((a, b) => {
    // Pinned mereu deasupra, indiferent de sortare
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return sortFn(a, b);
  });

  const paginated = filtered.slice(0, page * ITEMS_PER_PAGE);

  const SORT_LABELS: Record<SortOption, string> = {
    newest: 'Cele mai noi', oldest: 'Cele mai vechi',
    name_az: 'Nume A→Z', name_za: 'Nume Z→A',
    most_questions: 'Cele mai multe întrebări', best_score: 'Scor maxim',
  };

  if (!hydrated) return <PageSkeleton blocks={3} />;

  const hasFilters = !!search || category !== ALL_CATEGORIES || !!activeTag;
  const openImport = () => importRef.current?.querySelector('button')?.click();

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10 custom-scrollbar">
      <div className="max-w-4xl mx-auto">

        <PageHeader
          eyebrow="Biblioteca"
          title="Grilele tale"
          subtitle={`${filtered.length} grile ${filtered.length !== activeQuizzes.length ? `filtrate din ${activeQuizzes.length}` : 'disponibile'}`}
          tour={{ id: 'quizzes', label: 'Vezi turul listei de grile' }}
          actions={(
            <div data-tutorial="quizzes-actions" className="flex flex-wrap items-center gap-2">
              <div ref={importRef} data-tutorial="btn-import"><ImportQuizButton /></div>
              <Link to="/create"
                className="press-feedback focus-ring flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
                style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}>
                <Plus size={16} strokeWidth={2.5} />
                Grilă nouă
              </Link>
            </div>
          )}
        />

        {/* Search & Filters Premium Glass Container */}
        <div data-tutorial="quizzes-filters" className={`${calmMotion ? '' : 'fx-rise '}mb-8 p-5 rounded-[var(--r-xl)] glass-panel`} style={{ '--i': 1 } as CSSProperties}>
          
          <div className="flex items-center gap-4 px-5 py-4 rounded-[var(--r-md)] transition-[background-color,border-color,box-shadow] duration-300 bg-[var(--fill-subtle)] border border-[var(--hairline)] focus-within:border-[var(--accent)] focus-within:bg-transparent focus-within:shadow-[var(--ring-focus)]">
            <Search size={20} className="opacity-40" style={{ color: theme.text }} />
            <input
              type="search"
              aria-label="Caută grile"
              placeholder="Caută în titlu, descriere sau subiect..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent flex-1 text-sm font-bold outline-none border-none"
              style={{ color: theme.text }}
            />
            {search && (
              <button onClick={() => setSearch('')}
                aria-label="Șterge căutarea"
                className="fine-row press-feedback focus-ring p-1.5 hover:!text-[var(--text)]"
                style={{ color: theme.text3 }}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {allTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap px-1">
                <Tag size={14} className="opacity-30 mr-1" style={{ color: theme.text }} />
                {allTags.map(tag => (
                  <button key={tag} onClick={() => { setActiveTag(activeTag === tag ? null : tag); }}
                    aria-pressed={activeTag === tag}
                    className="fine-chip px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider press-feedback"
                    style={activeTag === tag ? undefined : { color: theme.text3 }}>
                    #{tag.replace(/>/g, ' › ')}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-4 border-t" style={{ borderColor: theme.border }}>
              <Filter size={16} className="opacity-30 mr-2 ml-1" style={{ color: theme.text }} />
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                {categories.map((cat) => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    aria-pressed={category === cat}
                    className="fine-chip px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap press-feedback"
                    style={category === cat ? undefined : { color: theme.text2, borderColor: 'transparent' }}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="ml-auto min-w-[180px]">
                <PremiumSelect
                  value={sort}
                  onChange={(val) => setSort(val as SortOption)}
                  options={(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([k, v]) => ({ value: k, label: v }))}
                  icon={<ArrowUpDown size={14} className="opacity-50" />}
                />
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: calmMotion ? dur.instant : dur.fast, ease: ease.standard }}>
              {hasFilters ? (
                <EmptyState
                  icon={Search}
                  title="Nicio grilă găsită"
                  body={search ? `Nu am găsit nimic pentru „${search}”. Încearcă un alt termen sau resetează filtrele.` : 'Nicio grilă nu se potrivește cu filtrele alese.'}
                  primary={{ label: 'Resetează filtrele', onClick: () => updateFilter({ q: null, cat: null, tag: null }) }}
                />
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title="Biblioteca ta este goală"
                  body="Începe prin a crea prima ta grilă sau importă un fișier de la colegi."
                  primary={{ label: 'Creează o grilă', to: '/create' }}
                  secondary={{ label: 'Importă', onClick: openImport }}
                />
              )}
            </motion.div>
          ) : (
            <motion.div key="grid" layout={!calmMotion} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {paginated.map((quiz, i) => (
                <QuizCard key={quiz.id} quiz={quiz} index={i} showDelete />
              ))}
              
              {filtered.length > paginated.length && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={loadMore}
                  className="press-feedback focus-ring col-span-full flex items-center justify-center gap-3 py-4 rounded-[var(--r-lg)] font-semibold text-[13px] glass-panel border border-[var(--hairline)] hover:border-accent/30"
                  style={{ color: theme.text2 }}>
                  <Sparkles size={16} className="text-accent" /> Încarcă mai multe ({filtered.length - paginated.length} rămase)
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Archived section */}
        {archivedQuizzes.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-12 pt-12 border-t" style={{ borderColor: theme.border }}>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="focus-ring flex items-center gap-3 mb-6 px-4 py-2 rounded-[var(--r-sm)] text-sm font-black uppercase tracking-widest fine-row"
              style={{ color: theme.text3 }}>
              <Archive size={16} />
              Grile Arhivate ({archivedQuizzes.length})
              <motion.span animate={{ rotate: showArchived ? 180 : 0 }} transition={{ duration: calmMotion ? dur.instant : dur.fast, ease: ease.standard }}>▼</motion.span>
            </button>
            <AnimatePresence>
              {showArchived && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }} transition={{ duration: calmMotion ? dur.instant : dur.fast }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {archivedQuizzes.map((quiz, i) => (
                      <QuizCard key={quiz.id} quiz={quiz} index={i} showDelete />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
