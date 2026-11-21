import { plural } from '../lib/plural';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronRight, Library, Play } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import { isFlashcardDeck } from '../lib/deckKind';
import { buildResidencyContext, classifyResidencyDeck } from '../lib/flashcardGroups';
import { useUIStore } from '../store/uiStore';
import { useToastStore } from '../store/toastStore';
import TourHelpButton from '../tutorial/TourHelpButton';
import BundledBooksSection from '../components/residency/BundledBooksSection';
import MaterialsBank from '../components/residency/MaterialsBank';
import RezidentiatQuizActions, { UserQuizFolders } from '../components/residency/RezidentiatQuizActions';
import { useAddRezidentiatBook } from '../hooks/useAddRezidentiatBook';
import ImportPanel from '../components/residency/ImportPanel';
import { useRezidentiatOverview } from '../components/residency/useResidencyData';
import type { BookCode } from '../lib/curriculum';
import { buildBankTree } from '../lib/rezidentiatBankTree';
import { startKumarDeckRoute } from '../lib/startKumarDeck';
import { adoptStrayResidencyQuizzes } from '../lib/rezidentiatPlacement';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore } from '../store/organizareStore';
import FxPage from '../components/fx/FxPage';
import PageHeader from '../components/ui/PageHeader';
import SectionLabel from '../components/ui/SectionLabel';
import ResidencyNav from '../components/residency/ResidencyNav';
import ProgressRing from '../components/residency/ProgressRing';
import PageSkeleton from '../components/ui/PageSkeleton';
import DuplicatesPanel from '../components/residency/DuplicatesPanel';
import GlassIconStack from '../components/depth/GlassIconStack';
import PlanCard from '../components/residency/PlanCard';
import ContinueChapter from '../components/residency/ContinueChapter';
import { usePlanProgress } from '../components/residency/useResidencyData';


export default function Residency() {
  const theme = useTheme();
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.addToast);
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const overview = useRezidentiatOverview();
  // /rezidentiat?book=K&chapter=10 (din Ctrl+K și din Organizare) deschide cartea și capitolul.
  const [searchParams] = useSearchParams();
  const linked = useMemo(() => {
    const code = searchParams.get('book');
    const index = Number(searchParams.get('chapter'));
    if ((code !== 'K' && code !== 'L' && code !== 'S') || !Number.isInteger(index) || index < 0) return null;
    return { code: code as BookCode, index, token: 1 };
  }, [searchParams]);
  const [shelfFocus, setShelfFocus] = useState<{ code: BookCode; index: number; token: number } | null>(() => linked);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const planProgress = usePlanProgress();
  const profileId = useUserStore((state) => state.activeProfileId) ?? 'default';
  const plan = useOrganizareStore((state) => state.byProfile[profileId]?.summary ?? null);
  const [today] = useState(() => new Date());
  const [booksOpen, setBooksOpen] = useState(() => linked !== null);

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
  const bank = useMemo(() => buildBankTree(overview), [overview]);
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
            ? `${plural(disciplines.filter((d) => d.specialties.some((s) => !s.loose)).length, 'disciplină', 'discipline')} · ${plural(totalSpecialties, 'specialitate', 'specialități')} · ${plural(totalQuestions, 'grilă', 'grile')}`
            : 'Grile reale, cărți și carduri, într-un singur loc.'}
          actions={(
            <>
              <TourHelpButton tour="residency" label="Vezi turul secțiunii Rezidențiat" />
              <button
                type="button"
                onClick={() => setBooksOpen((open) => !open)}
                aria-expanded={booksOpen}
                aria-label={booksOpen ? 'Ascunde cărțile de bază' : 'Arată cărțile de bază'}
                title="Cărțile de bază"
                className="press-feedback flex h-9 w-9 items-center justify-center rounded-full"
                style={{ color: theme.accentText, background: `${theme.accent}1F`, outline: `1px solid ${theme.accent}55` }}
              >
                <BookOpen size={18} strokeWidth={2.3} aria-hidden />
              </button>
              <RezidentiatQuizActions onAddBook={addBook.open} addingBook={addBook.busy !== null} />
            </>
          )}
        />

        <ResidencyNav
          deckCount={deckCount}
          startingDeck={startingDeck}
          onOrganizare={() => navigate('/rezidentiat/organizare')}
          onFlashcards={() => (deckCount > 0 ? navigate('/rezidentiat/flashcarduri') : void openKumarDeck())}
          onAsk={() => setChatOpen(true)}
        />

        {plan && !planProgress.focus && <PlanCard summary={plan} today={today} onOpen={() => navigate('/rezidentiat/organizare')} />}

        <ContinueChapter
          plan={planProgress}
          index={1}
          onOpen={() => {
            const chapter = planProgress.focus?.chapter;
            if (!chapter) return;
            setBooksOpen(true);
            setShelfFocus((previous) => ({ code: chapter.book, index: chapter.index, token: (previous?.token ?? 0) + 1 }));
          }}
        />

        {resume && !planProgress.focus && (
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

        {booksOpen && <BundledBooksSection overview={overview} plan={planProgress} focus={shelfFocus} />}

        {hasBank && (
          <section data-tutorial="residency-disciplines">
            <SectionLabel className="mb-2">Banca de grile</SectionLabel>
            <div className="fx-rise" style={{ '--i': 3 } as CSSProperties}>
              <Link
                to="/rezidentiat/banca"
                className="glass-panel fx-lift fx-spot press-feedback flex items-center gap-4 rounded-2xl p-[18px]"
              >
                <GlassIconStack icon={<Library size={20} />} color={theme.accentText} />
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold" style={{ color: theme.text }}>Banca de grile</div>
                  <div className="mt-0.5 text-[12.5px]" style={{ color: theme.text3 }}>
                    {bank.books.length > 0 ? `${bank.books.map((book) => book.short).join(' · ')} · ` : ''}{plural(bank.questionCount, 'grilă', 'grile')}
                  </div>
                </div>
                <ProgressRing percent={bank.progress} label={`${bank.progress}% parcurs`} />
                <ChevronRight size={16} aria-hidden style={{ color: theme.text3 }} />
              </Link>
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
              className="fine-chip press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
              style={{ color: theme.accentText }}
            >
              {plural(duplicates.duplicateCount, 'întrebare duplicată', 'întrebări duplicate')} · {showDuplicates ? 'Ascunde lista' : 'Vezi dublatele'}
              <ChevronRight size={13} aria-hidden style={{ transform: showDuplicates ? 'rotate(90deg)' : 'none', transition: 'transform 180ms ease' }} />
            </button>
          </div>
        )}
        {hasBank && showDuplicates && duplicates.duplicateCount > 0 && <DuplicatesPanel report={duplicates} />}

        <div data-tutorial="residency-import" className="empty:hidden">
          <ImportPanel />
        </div>

        <MaterialsBank onAdd={addBook.open} adding={addBook.busy} onDropFiles={(files) => void addBook.addFiles(files)} />

      </div>
    </FxPage>
  );
}
