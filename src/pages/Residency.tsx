import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Layers, Loader2, MessageCircle, Play, Scissors, Stethoscope, Library, HeartPulse, BookOpen, CalendarRange } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore } from '../store/aiStore';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import { isFlashcardDeck } from '../lib/deckKind';
import { buildResidencyContext, classifyResidencyDeck } from '../lib/flashcardGroups';
import { useUIStore } from '../store/uiStore';
import { useToastStore } from '../store/toastStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import TourHelpButton from '../tutorial/TourHelpButton';
import BookShelf from '../components/residency/BookShelf';
import BookLibraryTools from '../components/residency/BookLibraryTools';
import RezidentiatQuizActions, { UserQuizFolders } from '../components/residency/RezidentiatQuizActions';
import { useAddRezidentiatBook } from '../hooks/useAddRezidentiatBook';
import ImportPanel from '../components/residency/ImportPanel';
import { useRezidentiatOverview, useResidencyBooks } from '../components/residency/useResidencyData';
import type { BookCode } from '../lib/curriculum';
import { disciplineKey } from '../lib/rezidentiatOverview';
import { startKumarDeckRoute } from '../lib/startKumarDeck';
import { REZIDENTIAT_ROOT_NAME } from '../lib/rezidentiatRoot';
import { adoptStrayResidencyQuizzes } from '../lib/rezidentiatPlacement';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore } from '../store/organizareStore';
import { daysUntil } from '../lib/organizare';
import FxPage from '../components/fx/FxPage';
import PageHeader from '../components/ui/PageHeader';
import SectionLabel from '../components/ui/SectionLabel';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import DuplicatesPanel from '../components/residency/DuplicatesPanel';
import PlanCard from '../components/residency/PlanCard';
import ContinueChapter from '../components/residency/ContinueChapter';
import { usePlanProgress } from '../components/residency/useResidencyData';

const number = (value: number) => value.toLocaleString('ro-RO');

function DisciplineIcon({ name, size = 20 }: { name: string; size?: number }) {
  const key = disciplineKey(name);
  if (key === 'chirurgie') return <Scissors size={size} />;
  if (key === 'medicina-interna') return <HeartPulse size={size} />;
  return <Stethoscope size={size} />;
}

function ResourceRow({
  icon,
  title,
  detail,
  onClick,
  busy,
  first,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  busy?: boolean;
  first?: boolean;
}) {
  const theme = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      className="fine-row flex w-full items-center gap-3 px-4 py-3 text-left"
      style={{ borderRadius: 0, borderTop: first ? undefined : '1px solid var(--hairline)' }}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold" style={{ color: theme.text }}>{title}</div>
        <div className="truncate text-[12px]" style={{ color: theme.text3 }}>{detail}</div>
      </div>
      {busy ? <Loader2 size={16} className="animate-spin" style={{ color: theme.text3 }} /> : <ChevronRight size={16} style={{ color: theme.text3 }} />}
    </button>
  );
}

export default function Residency() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { calmMotion } = useAdaptiveMotion();
  const addToast = useToastStore((state) => state.addToast);
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const addLibraryFolder = useAIStore((state) => state.addLibraryFolder);
  const overview = useRezidentiatOverview();
  const { books, hasLibraryRoot } = useResidencyBooks();
  // /rezidentiat?book=K&chapter=10 (din Ctrl+K și din Organizare) deschide cartea și capitolul.
  const [searchParams] = useSearchParams();
  const linked = useMemo(() => {
    const code = searchParams.get('book');
    const index = Number(searchParams.get('chapter'));
    if ((code !== 'K' && code !== 'L' && code !== 'S') || !Number.isInteger(index) || index < 0) return null;
    return { code: code as BookCode, index, token: 1 };
  }, [searchParams]);
  const [showBooks, setShowBooks] = useState(() => linked !== null);
  const [shelfFocus, setShelfFocus] = useState<{ code: BookCode; index: number; token: number } | null>(() => linked);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const planProgress = usePlanProgress();
  const profileId = useUserStore((state) => state.activeProfileId) ?? 'default';
  const plan = useOrganizareStore((state) => state.byProfile[profileId]?.summary ?? null);
  const [today] = useState(() => new Date());
  const planDetail = plan
    ? `${plan.phase <= 4 ? `Trecerea ${plan.phase} din 4 · ${plan.done} din ${plan.total} topicuri` : 'Simulări și menținere'} · ${daysUntil(plan.exam, today)} zile până la examen`
    : 'Planul tău pe patru treceri, săptămâni și ritm zilnic';

  // Sets an AI agent filed straight into the section root are moved into "Grile" so none is stranded.
  // Runs once the profile's data is in the stores: with empty stores it would find nothing and never run again.
  const hydrated = useQuizStore((state) => state._hasHydrated);
  const allQuizzes = useQuizStore((state) => state.quizzes);
  const allFolders = useFolderStore((state) => state.folders);
  const deckCount = useMemo(() => {
    const context = buildResidencyContext(allFolders);
    return allQuizzes.filter((quiz) => !quiz.archived && isFlashcardDeck(quiz) && classifyResidencyDeck(quiz, context) !== null).length;
  }, [allQuizzes, allFolders]);
  useEffect(() => { if (hydrated) adoptStrayResidencyQuizzes(); }, [hydrated]);
  const [startingDeck, setStartingDeck] = useState(false);
  const addBook = useAddRezidentiatBook();

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

  // Before the profile loads every list is empty: showing "nothing yet" (or offering to add every bank) would be wrong.
  if (!hydrated) return <PageSkeleton />;

  const { disciplines, resume, totalQuestions, totalSpecialties } = overview;
  const hasBank = disciplines.length > 0;
  const { duplicates } = overview;

  return (
    <FxPage className="px-4 py-6 sm:px-8 sm:py-10">
      <input {...addBook.inputProps} />
      <div className="mx-auto max-w-4xl space-y-7">
        <PageHeader
          title="Rezidențiat"
          subtitle={hasBank
            ? `${disciplines.filter((d) => d.specialties.some((s) => !s.loose)).length} discipline · ${totalSpecialties} specialități · ${number(totalQuestions)} grile`
            : 'Grile reale, cărți și carduri, într-un singur loc.'}
          actions={(
            <>
              <TourHelpButton tour="residency" label="Vezi turul secțiunii Rezidențiat" />
              <RezidentiatQuizActions onAddBook={addBook.open} addingBook={addBook.busy !== null} />
            </>
          )}
        />

        {plan && !planProgress.focus && <PlanCard summary={plan} today={today} onOpen={() => navigate('/rezidentiat/organizare')} />}

        <ContinueChapter
          plan={planProgress}
          index={1}
          onOpen={() => {
            const chapter = planProgress.focus?.chapter;
            if (!chapter) return;
            setShowBooks(true);
            setShelfFocus((previous) => ({ code: chapter.book, index: chapter.index, token: (previous?.token ?? 0) + 1 }));
          }}
        />

        {resume && (
          <div
            className="glass-panel fx-rise flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
            style={{ '--i': 2 } as CSSProperties}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
              <Play size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px]" style={{ color: theme.text3 }}>Continuă</div>
              <div className="truncate text-[14.5px] font-semibold" style={{ color: theme.text }}>{resume.quiz.title}</div>
            </div>
            <Link
              to={`/quiz/${resume.quiz.id}`}
              className="press-feedback rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
              style={{ background: theme.accent }}
            >
              Reia
            </Link>
          </div>
        )}

        {hasBank && (
          <section data-tutorial="residency-disciplines">
            <SectionLabel className="mb-2">Discipline</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              {disciplines.map((discipline, index) => (
                <div key={discipline.folder.id} className="fx-rise" style={{ '--i': index + 3 } as CSSProperties}>
                  <Link
                    to={`/rezidentiat/${discipline.folder.id}`}
                    className="glass-panel fx-lift fx-spot press-feedback block rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
                        <DisciplineIcon name={discipline.folder.name} />
                      </div>
                      <ChevronRight size={16} style={{ color: theme.text3 }} />
                    </div>
                    <div className="mt-3 text-[16px] font-semibold" style={{ color: theme.text }}>{discipline.folder.name}</div>
                    <div className="text-[12.5px]" style={{ color: theme.text3 }}>
                      {discipline.specialties.length} specialități · {number(discipline.questionCount)} grile
                    </div>
                    <div className="mt-3.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }}>
                      <div className="h-full rounded-full" style={{ width: `${discipline.progress}%`, background: theme.accent }} />
                    </div>
                    <div className="mt-1.5 text-[11.5px]" style={{ color: theme.text3 }}>{discipline.progress}% parcurs</div>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        <UserQuizFolders />

        {hasBank && duplicates.duplicateCount > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowDuplicates((open) => !open)}
              aria-expanded={showDuplicates}
              className="press-feedback text-[12.5px] hover:underline"
              style={{ color: theme.text3 }}
            >
              {duplicates.duplicateCount} întrebări duplicate · {showDuplicates ? 'Ascunde lista' : 'Vezi dublatele'}
            </button>
          </div>
        )}
        {hasBank && showDuplicates && duplicates.duplicateCount > 0 && <DuplicatesPanel report={duplicates} />}

        <section data-tutorial="residency-resources">
          <SectionLabel className="mb-2">Resurse</SectionLabel>
          <div className="glass-panel overflow-hidden rounded-2xl">
            <ResourceRow
              first
              icon={<CalendarRange size={18} />}
              title="Organizare"
              detail={planDetail}
              onClick={() => navigate('/rezidentiat/organizare')}
            />
            <ResourceRow
              icon={<Layers size={18} />}
              title="Flashcarduri"
              detail={deckCount > 0 ? `${deckCount} ${deckCount === 1 ? 'pachet' : 'pachete'} · pe capitole, repetare spațiată` : 'Concepte cheie din manual, pe capitole'}
              onClick={() => (deckCount > 0 ? navigate('/rezidentiat/flashcarduri') : void openKumarDeck())}
              busy={startingDeck}
            />
            <ResourceRow
              icon={<Library size={18} />}
              title="Cărțile tale"
              detail={books.length > 0 ? `${books.length} ${books.length === 1 ? 'carte' : 'cărți'} · capitolele din plan, progres, carduri și AI` : 'Capitolele din plan, chiar și fără cărți adăugate'}
              onClick={() => setShowBooks((open) => !open)}
            />
            <ResourceRow
              icon={<MessageCircle size={18} />}
              title="Întreabă din cărți"
              detail="Răspunsuri cu trimitere la capitol"
              onClick={() => setChatOpen(true)}
            />
          </div>
        </section>

        {showBooks && (
          hasLibraryRoot ? (
            <section className={calmMotion ? '' : 'fx-rise'}>
              <SectionLabel className="mb-2">Cărțile tale</SectionLabel>
              <BookLibraryTools />
              <BookShelf books={books} showPlanBooks focus={shelfFocus} />
            </section>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="Secțiunea Rezidențiat lipsește"
              body="Creează secțiunea Rezidențiat în bibliotecă, apoi încarcă acolo cărțile de referință."
              primary={{ label: 'Creează secțiunea', onClick: () => addLibraryFolder(REZIDENTIAT_ROOT_NAME, '🩺') }}
            />
          )
        )}

        <div data-tutorial="residency-import" className="empty:hidden">
          <ImportPanel />
        </div>
      </div>
    </FxPage>
  );
}
