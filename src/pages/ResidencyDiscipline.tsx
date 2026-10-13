import { plural } from '../lib/plural';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Layers, SearchX, Loader2, Play, Plus, Shuffle } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import FxPage from '../components/fx/FxPage';
import SegmentedTabs from '../components/fx/SegmentedTabs';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SectionLabel from '../components/ui/SectionLabel';
import type { Quiz } from '../types';
import { useToastStore } from '../store/toastStore';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import BookShelf from '../components/residency/BookShelf';
import { useRezidentiatOverview, useResidencyBooks } from '../components/residency/useResidencyData';
import { bookDisciplineHint, disciplineKey, isFolderSessionQuiz, type SpecialtyOverview } from '../lib/rezidentiatOverview';
import { startKumarDeckRoute } from '../lib/startKumarDeck';
import { startQuizMix } from '../lib/quizMixSession';
import { REZIDENTIAT_BANKS } from '../lib/rezidentiatBank';
import { REZIDENTIAT_AI_FLASHCARDS_FOLDER_NAME, findRezidentiatRootFolder } from '../lib/rezidentiatRoot';

type Tab = 'specialitati' | 'carti' | 'carduri';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'specialitati', label: 'Specialități' },
  { id: 'carti', label: 'Cărți' },
  { id: 'carduri', label: 'Carduri' },
];


/** "Cardiologie — Test 3" → "Test 3": the specialty is already the heading above it. */
function shortTitle(title: string, specialty: string): string {
  const stripped = title.replace(specialty, '').replace(/^[\s—–:-]+/, '').trim();
  return stripped || title;
}

/** Which bundled bank a quiz came from, so one specialty's tests can be shown grouped by source. */
function bankLabel(quiz: { tags?: string[] }): string {
  const tag = quiz.tags?.find((t) => t.startsWith('rezidentiat-bank:'));
  if (!tag && quiz.tags?.includes('ai-studio')) return 'Generate cu AI';
  return REZIDENTIAT_BANKS.find((bank) => bank.tag === tag)?.label ?? 'Alte grile';
}

function SpecialtyDetail({ specialty }: { specialty: SpecialtyOverview }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const sessions = useQuizStore((state) => state.sessions);

  const bestByQuiz = useMemo(() => {
    const best = new Map<string, number>();
    for (const session of sessions) {
      if (!session.finishedAt || session.total <= 0) continue;
      const pct = Math.round((session.score / session.total) * 100);
      if (pct > (best.get(session.quizId) ?? -1)) best.set(session.quizId, pct);
    }
    return best;
  }, [sessions]);

  const groups = useMemo(() => {
    const byLabel = new Map<string, Quiz[]>();
    for (const quiz of specialty.quizzes) {
      const label = bankLabel(quiz);
      byLabel.set(label, [...(byLabel.get(label) ?? []), quiz]);
    }
    return [...byLabel.entries()].map(([label, quizzes]) => ({ label, quizzes }));
  }, [specialty.quizzes]);

  const next = specialty.quizzes.find((quiz) => !bestByQuiz.has(quiz.id)) ?? specialty.quizzes[0];
  const untouched = specialty.answered === 0;

  // Archived sets drop out of the overview; keep them reachable (and restorable) right under the active ones.
  const allQuizzes = useQuizStore((state) => state.quizzes);
  const toggleArchive = useQuizStore((state) => state.toggleArchive);
  const folders = useFolderStore((state) => state.folders);
  const archived = useMemo(() => {
    const inside = new Set([specialty.folder.id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const folder of folders) {
        if (folder.parentId && inside.has(folder.parentId) && !inside.has(folder.id)) { inside.add(folder.id); grew = true; }
      }
    }
    return allQuizzes.filter((quiz) => quiz.archived && quiz.kind !== 'flashcard' && !!quiz.folderId && inside.has(quiz.folderId) && !isFolderSessionQuiz(quiz));
  }, [allQuizzes, folders, specialty.folder.id]);

  return (
    <div className="min-w-0 space-y-3">
      <div className="glass-panel rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold" style={{ color: theme.text }}>{specialty.name}</div>
            <div className="text-[12.5px]" style={{ color: theme.text3 }}>
              {plural(specialty.quizzes.length, 'test', 'teste')} · {plural(specialty.questionCount, 'grilă', 'grile')} · {specialty.progress}% parcurs
            </div>
          </div>
          {next && (
            <Link
              to={`/quiz/${next.id}`}
              className="press-feedback flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
              style={{ background: theme.accent }}
            >
              <Play size={13} /> {untouched ? 'Începe' : 'Continuă'}
            </Link>
          )}
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }}>
          <div className="h-full rounded-full" style={{ width: `${specialty.progress}%`, background: theme.accent }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {specialty.quizzes.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const id = startQuizMix(specialty.folder, specialty.quizzes, { title: `${specialty.name} — sesiune completă`, residency: true });
                if (id) navigate(`/play/${id}`);
              }}
              className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
              style={{ color: theme.text2 }}
            >
              <Shuffle size={13} /> Joacă tot
            </button>
          )}
          <Link
            to={`/create?folder=${specialty.folder.id}`}
            className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
            style={{ color: theme.text2 }}
          >
            <Plus size={13} /> Grilă nouă
          </Link>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.label}>
          {groups.length > 1 && (
            <SectionLabel className="mb-1.5 mt-1">{group.label}</SectionLabel>
          )}
          <div className="glass-panel overflow-hidden rounded-2xl">
            {group.quizzes.map((quiz, index) => {
              const best = bestByQuiz.get(quiz.id);
              const color = best === undefined ? theme.text3 : best >= 75 ? theme.success : best >= 45 ? theme.warning : theme.danger;
              return (
                <Link
                  key={quiz.id}
                  to={`/quiz/${quiz.id}`}
                  className="fine-row flex items-center gap-3 px-4 py-3"
                  style={{ borderRadius: 0, borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{shortTitle(quiz.title, specialty.name)}</div>
                    <div className="text-[12px]" style={{ color: theme.text3 }}>{plural(quiz.questions.length, 'grilă', 'grile')}</div>
                  </div>
                  <span className="text-[12.5px] font-semibold" style={{ color }}>{best === undefined ? 'Neîncercat' : `${best}%`}</span>
                  <ChevronRight size={16} style={{ color: theme.text3 }} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {archived.length > 0 && (
        <details className="group">
          <summary className="mb-1.5 mt-1 cursor-pointer select-none px-1 text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>
            Arhivate ({archived.length})
          </summary>
          <div className="glass-panel overflow-hidden rounded-2xl">
            {archived.map((quiz, index) => (
              <div
                key={quiz.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
              >
                <Link to={`/quiz/${quiz.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold" style={{ color: theme.text2 }}>{shortTitle(quiz.title, specialty.name)}</div>
                  <div className="text-[12px]" style={{ color: theme.text3 }}>{plural(quiz.questions.length, 'grilă', 'grile')}</div>
                </Link>
                <button
                  type="button"
                  onClick={() => toggleArchive(quiz.id)}
                  className="fine-chip press-feedback flex-shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                  style={{ color: theme.accentText }}
                >
                  Restaurează
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function ResidencyDiscipline() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { folderId } = useParams<{ folderId: string }>();
  const addToast = useToastStore((state) => state.addToast);
  const overview = useRezidentiatOverview();
  const { books } = useResidencyBooks();
  const folders = useFolderStore((state) => state.folders);
  const quizzes = useQuizStore((state) => state.quizzes);
  const hydrated = useQuizStore((state) => state._hasHydrated);
  const [tab, setTab] = useState<Tab>('specialitati');
  // The selected specialty lives in the URL, so Back/Forward and shared links land on the same one.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('s');
  const setSelectedId = (id: string) => setSearchParams({ s: id }, { replace: true });
  const [startingDeck, setStartingDeck] = useState(false);

  const discipline = overview.disciplines.find((d) => d.folder.id === folderId) ?? null;
  const selected = discipline?.specialties.find((s) => s.folder.id === selectedId) ?? discipline?.specialties[0] ?? null;

  const disciplineBooks = useMemo(() => {
    if (!discipline) return [];
    const key = disciplineKey(discipline.folder.name);
    return key ? books.filter((book) => bookDisciplineHint(book.name) === key) : [];
  }, [books, discipline]);

  const aiDecks = useMemo(() => {
    const root = findRezidentiatRootFolder(folders);
    const folder = root ? folders.find((f) => f.parentId === root.id && f.name === REZIDENTIAT_AI_FLASHCARDS_FOLDER_NAME) : null;
    if (!folder) return [];
    // A deck belongs to the discipline of the book it was generated from (its tags carry the book's name);
    // decks from books without a clear discipline show under disciplines that have none either.
    const key = discipline ? disciplineKey(discipline.folder.name) : null;
    const deckDiscipline = (deck: Quiz) => (deck.tags ?? []).map(bookDisciplineHint).find((hint) => hint !== null) ?? null;
    return quizzes.filter((q) => q.folderId === folder.id && !q.archived && q.kind === 'flashcard' && deckDiscipline(q) === key);
  }, [folders, quizzes, discipline]);

  if (!hydrated) return <PageSkeleton />;

  // The folder exists but holds no active grile (new, or everything archived): show it like any folder,
  // where grile and subfolders can be added, instead of "not found".
  if (!discipline && folderId && folders.some((entry) => entry.id === folderId)) {
    return <Navigate to={`/folder/${folderId}?plain=1`} replace />;
  }

  if (!discipline) {
    return (
      <FxPage className="px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-4xl">
          <EmptyState icon={SearchX} title="Disciplina nu a fost găsită." primary={{ label: 'Înapoi la Rezidențiat', to: '/rezidentiat' }} />
        </div>
      </FxPage>
    );
  }

  const openKumarDeck = async () => {
    if (startingDeck) return;
    setStartingDeck(true);
    try {
      const start = await startKumarDeckRoute();
      if (start) navigate(start.path);
      else addToast('Setul de carduri nu a putut fi încărcat.', 'error', 5000);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Setul de carduri nu a putut fi încărcat.', 'error', 5000);
    } finally {
      setStartingDeck(false);
    }
  };

  return (
    <FxPage className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          back={{ to: '/rezidentiat', label: 'Rezidențiat' }}
          title={discipline.folder.name}
          subtitle={`${plural(discipline.specialties.filter((entry) => !entry.loose).length, 'specialitate', 'specialități')} · ${plural(discipline.questionCount, 'grilă', 'grile')} · ${discipline.progress}% parcurs`}
        />

        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} layoutId="residency-tab-pill" ariaLabel="Secțiunile disciplinei" />

        {tab === 'specialitati' && selected && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <div
              className="max-h-[40vh] self-start overflow-y-auto rounded-2xl lg:sticky lg:top-2 lg:max-h-[calc(100vh-9rem)]"
              style={{ background: theme.surface, border: '1px solid var(--hairline)' }}
              role="listbox"
              aria-label="Specialități"
            >
              {discipline.specialties.map((specialty, index) => {
                const active = specialty.folder.id === selected.folder.id;
                return (
                  <button
                    key={specialty.folder.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => setSelectedId(specialty.folder.id)}
                    className="fine-row fine-row--flat flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
                    style={{ borderRadius: 0, borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold" title={specialty.name} style={{ color: active ? theme.accent : theme.text }}>{specialty.name}</div>
                      <div className="text-[11.5px]" style={{ color: theme.text3 }}>{plural(specialty.quizzes.length, 'test', 'teste')} · {plural(specialty.questionCount, 'grilă', 'grile')}</div>
                    </div>
                    <span className="text-[11.5px] font-semibold" style={{ color: active ? theme.accent : theme.text3 }}>{specialty.progress}%</span>
                  </button>
                );
              })}
            </div>
            <SpecialtyDetail key={selected.folder.id} specialty={selected} />
          </div>
        )}

        {tab === 'carti' && (
          <BookShelf
            books={disciplineBooks}
            emptyMessage="Nicio carte pentru această disciplină. Cărțile fără disciplină clară (ex. Sinopsis) sunt în ecranul principal, la „Cărțile tale”."
          />
        )}

        {tab === 'carduri' && (
          <div className="space-y-4">
            <div className="glass-panel overflow-hidden rounded-2xl">
              <button
                type="button"
                onClick={() => void openKumarDeck()}
                className="fine-row flex w-full items-center gap-3 px-4 py-3.5 text-left"
                style={{ borderRadius: 0 }}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
                  <Layers size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold" style={{ color: theme.text }}>Carduri Kumar</div>
                  <div className="text-[12px]" style={{ color: theme.text3 }}>Concepte cheie din manual, pe capitole</div>
                </div>
                {startingDeck ? <Loader2 size={16} className="animate-spin" style={{ color: theme.text3 }} /> : <ChevronRight size={16} style={{ color: theme.text3 }} />}
              </button>
            </div>
            {aiDecks.length > 0 && (
              <div>
                <SectionLabel className="mb-2">Generate din cărți</SectionLabel>
                <div className="glass-panel overflow-hidden rounded-2xl">
                  {aiDecks.map((deck, index) => (
                    <Link
                      key={deck.id}
                      to={`/flashcards/session/${deck.id}`}
                      className="fine-row flex items-center gap-3 px-4 py-3"
                      style={{ borderRadius: 0, borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{deck.title}</div>
                        <div className="text-[12px]" style={{ color: theme.text3 }}>{plural(deck.questions.length, 'card', 'carduri')}</div>
                      </div>
                      <ChevronRight size={16} style={{ color: theme.text3 }} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </FxPage>
  );
}
