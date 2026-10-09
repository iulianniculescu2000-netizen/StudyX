import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, CreditCard, MessageCircle, Sparkles } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import EmptyState from '../ui/EmptyState';
import { isSourceReady, useAIStore, type AIKnowledgeSource } from '../../store/aiStore';
import { useAddRezidentiatBook } from '../../hooks/useAddRezidentiatBook';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import { useSourceChapters } from '../../hooks/useSourceChapters';
import { BOOK_NAMES, bookOfSourceName, type BookCode } from '../../lib/curriculum';
import BookTableOfContents from '../BookTableOfContents';
import PlanChapters from './PlanChapters';
import { ChapterAction } from './ChapterChip';
import { useChapterActions } from './useChapterActions';
import { useRezidentiatOverview, usePlanProgress } from './useResidencyData';
import type { Quiz, QuestionStat } from '../../types';

type Theme = ReturnType<typeof useTheme>;

/**
 * Accuracy across every quiz `generateQuizFromChapter` tagged with this exact
 * chapter (`['ai-studio','chapter-pack', sourceName, heading]`) — the same tag
 * convention every other weak-topic view in the app reads. Null when nothing
 * has been attempted yet, so the UI can show a neutral state instead of 0%.
 */
/** Doar pachetele de capitol, extrase o singură dată per versiune a listei (rândurile cărților o cer de zeci de ori). */
let chapterPackCache: { source: Quiz[]; packs: Quiz[] } | null = null;
function chapterPacks(quizzes: Quiz[]): Quiz[] {
  if (chapterPackCache?.source !== quizzes) {
    chapterPackCache = { source: quizzes, packs: quizzes.filter((quiz) => (quiz.tags ?? []).includes('chapter-pack')) };
  }
  return chapterPackCache.packs;
}

function useChapterAccuracy(sourceName: string, heading: string): { accuracy: number; attempted: number } | null {
  const quizzes = useQuizStore((state) => state.quizzes);
  const questionStats = useStatsStore((state) => state.questionStats);

  return useMemo(() => {
    const matchingQuizzes = chapterPacks(quizzes).filter((quiz: Quiz) => {
      const tags = quiz.tags ?? [];
      return tags.includes(sourceName) && tags.includes(heading);
    });
    if (matchingQuizzes.length === 0) return null;

    let correct = 0;
    let attempted = 0;
    for (const quiz of matchingQuizzes) {
      for (const question of quiz.questions) {
        const stat: QuestionStat | undefined = questionStats[`${quiz.id}:${question.id}`];
        if (!stat) continue;
        correct += stat.timesCorrect;
        attempted += stat.timesCorrect + stat.timesWrong;
      }
    }
    if (attempted === 0) return null;
    return { accuracy: Math.round((correct / attempted) * 100), attempted };
  }, [quizzes, questionStats, sourceName, heading]);
}

function ChapterAccuracy({ sourceName, heading, theme }: { sourceName: string; heading: string; theme: Theme }) {
  const progress = useChapterAccuracy(sourceName, heading);
  if (!progress) return null;
  const color = progress.accuracy >= 75 ? theme.success : progress.accuracy >= 45 ? theme.warning : theme.danger;
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {progress.accuracy}%
    </span>
  );
}

/** Capitolele detectate în text, pentru cărțile care nu sunt în planul din Organizare. */
function DetectedChapters({ source, theme }: { source: AIKnowledgeSource; theme: Theme }) {
  const { chapters, loading } = useSourceChapters(source.id);
  const actions = useChapterActions(source);

  if (loading) {
    return (
      <div className="space-y-2 py-3">
        <div className="skeleton-block h-12 rounded-xl" />
        <div className="skeleton-block h-12 rounded-xl" />
      </div>
    );
  }

  if (chapters.length === 0) {
    return <p className="py-4 text-sm" style={{ color: theme.text3 }}>Nu am găsit încă fragmente indexate pentru această carte.</p>;
  }

  return (
    <div>
      {chapters.map((chapter, index) => (
        <div
          key={chapter.heading}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
          style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>{chapter.label}</div>
              <ChapterAccuracy sourceName={source.name} heading={chapter.heading} theme={theme} />
            </div>
            <div className="mt-0.5 text-[11.5px]" style={{ color: theme.text3 }}>{chapter.chunkCount} fragmente</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <ChapterAction icon={<MessageCircle size={12} />} label="Discută" onClick={() => actions.discuss(chapter.heading, chapter.label)} />
            <ChapterAction icon={<Sparkles size={12} />} label="Grile" onClick={() => actions.generateQuiz(chapter.heading, chapter.label)} />
            <ChapterAction
              icon={<CreditCard size={12} />}
              label="Carduri"
              busy={actions.generatingHeading === chapter.heading}
              onClick={() => void actions.generateCards(chapter.heading, chapter.label)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** O carte din raft: una din bibliotecă, sau una din plan care nu a fost încă adăugată în bibliotecă. */
interface ShelfEntry {
  id: string;
  source: AIKnowledgeSource | null;
  code: BookCode | null;
  title: string;
}

interface BookShelfProps {
  books: AIKnowledgeSource[];
  emptyMessage?: string;
  /** Arată și cărțile din plan (Kumar, Lawrence, Sinopsis) care nu sunt încă în bibliotecă, ca să rămână vizibile capitolele. */
  showPlanBooks?: boolean;
  /** Cartea și capitolul de deschis (ex. „Continuă de unde ai rămas”); `token` schimbat redeschide aceeași țintă. */
  focus?: { code: BookCode; index: number; token: number } | null;
}

const bookTitle = (source: AIKnowledgeSource) => source.name.replace(/\.pdf$/i, '');

/** Reference books as one calm list; a book opens in place to show its chapters. */
export default function BookShelf({ books, emptyMessage, showPlanBooks = false, focus = null }: BookShelfProps) {
  const theme = useTheme();
  const overview = useRezidentiatOverview();
  const plan = usePlanProgress();
  const addBook = useAddRezidentiatBook();
  const removeKnowledgeSource = useAIStore((state) => state.removeKnowledgeSource);

  const entries = useMemo<ShelfEntry[]>(() => {
    const own = books.map((source) => ({ id: source.id, source, code: bookOfSourceName(source.name), title: bookTitle(source) }));
    // Ordinea din plan (Kumar, Lawrence, Sinopsis); cărțile necunoscute rămân la sfârșit, în ordinea bibliotecii.
    const rank = (code: BookCode | null) => (code ? ['K', 'L', 'S'].indexOf(code) : 3);
    const byPlan = (items: ShelfEntry[]) => [...items].sort((a, b) => rank(a.code) - rank(b.code));
    if (!showPlanBooks) return byPlan(own);
    const present = new Set(own.map((entry) => entry.code));
    const missing = (['K', 'L', 'S'] as const)
      .filter((code) => !present.has(code))
      .map((code) => ({ id: `plan:${code}`, source: null, code, title: BOOK_NAMES[code] }));
    return byPlan([...own, ...missing]);
  }, [books, showPlanBooks]);

  const focusId = focus ? entries.find((entry) => entry.code === focus.code)?.id ?? null : null;
  const [expandedId, setExpandedId] = useState<string | null>(focusId);
  const [seenToken, setSeenToken] = useState(focus?.token ?? 0);
  if (focus && focus.token !== seenToken) {
    setSeenToken(focus.token);
    setExpandedId(focusId);
  }

  if (entries.length === 0) {
    return (
      <>
        <input {...addBook.inputProps} />
        <EmptyState
          icon={BookOpen}
          title="Nicio carte încă"
          body={emptyMessage}
          primary={{ label: addBook.busy ?? 'Adaugă o carte', onClick: addBook.open }}
        />
      </>
    );
  }

  return (
    <div className="glass-panel overflow-hidden rounded-2xl">
      {entries.map((entry, index) => {
        const { source, code } = entry;
        const expanded = expandedId === entry.id;
        const status = !source
          ? 'Nu e în bibliotecă · capitolele din plan, fără text'
          : isSourceReady(source)
            ? `${source.chunkCount} fragmente`
            : source.indexStatus === 'indexing'
              ? `Indexare… ${Math.round(source.indexProgress ?? 0)}%`
              : 'Eroare la indexare';
        return (
          <div key={entry.id} style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}>
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : entry.id)}
              className="fine-row flex w-full items-center gap-3 px-4 py-3.5 text-left"
              style={{ borderRadius: 0 }}
              aria-expanded={expanded}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
                <BookOpen size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{entry.title}</div>
                <div className="text-[12px]" style={{ color: source?.indexStatus === 'error' ? theme.danger : theme.text3 }}>{status}</div>
              </div>
              <ChevronDown size={16} className="transition-transform" style={{ color: theme.text3, transform: expanded ? 'rotate(180deg)' : undefined }} />
            </button>
            {expanded && (
              <div className="fx-rise px-4" style={{ background: 'var(--fill-subtle)' }}>
                {code ? (
                  <PlanChapters
                    code={code}
                    source={source}
                    overview={overview}
                    plan={plan}
                    focusIndex={focus?.code === code ? focus.index : null}
                  />
                ) : source && isSourceReady(source) ? (
                  <>
                    <BookTableOfContents source={source} theme={theme} />
                    <DetectedChapters source={source} theme={theme} />
                  </>
                ) : source && source.indexStatus === 'indexing' ? (
                  <p className="py-4 text-sm" style={{ color: theme.text3 }}>
                    Cartea se indexează încă — capitolele apar când se termină.
                  </p>
                ) : (
                  <p className="py-4 text-sm" style={{ color: theme.danger }}>
                    Indexarea a eșuat{source?.indexError ? `: ${source.indexError}` : '.'}{' '}
                    {source && <button type="button" className="underline" onClick={() => void removeKnowledgeSource(source.id)}>Șterge cartea</button>}
                    {' '}și adaug-o din nou cu „+” de sus.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
