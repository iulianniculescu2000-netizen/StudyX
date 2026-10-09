import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useUserStore } from '../store/userStore';
import { useQuizStore } from '../store/quizStore';
import { computeDashboardTrends } from '../lib/dashboardTrends';
import { useStatsStore } from '../store/statsStore';
import { useTutorialStore } from '../store/tutorialStore';
import ImportQuizButton from '../components/ImportQuizButton';
import MagicImportCard from '../components/MagicImportCard';
import QuizCard from '../components/QuizCard';
import DashboardErrorBoundary from '../components/dashboard/DashboardErrorBoundary';
import MagneticButton from '../components/dashboard/MagneticButton';
import { useOrganizareStore } from '../store/organizareStore';
import DashboardHeroCard from '../components/dashboard/DashboardHeroCard';
import DashboardCrunchCard from '../components/dashboard/DashboardCrunchCard';
import DashboardTodayCard from '../components/dashboard/DashboardTodayCard';
import DashboardStatStrip, { type DashboardStat } from '../components/dashboard/DashboardStatStrip';
import DashboardTipStrip from '../components/dashboard/DashboardTipStrip';
import StudyConsistencyMap from '../components/dashboard/StudyConsistencyMap';
import FxPage from '../components/fx/FxPage';
import PageHeader from '../components/ui/PageHeader';
import PageSkeleton from '../components/ui/PageSkeleton';
import SectionLabel from '../components/ui/SectionLabel';
import EmptyState from '../components/ui/EmptyState';
import { useScopedSources } from '../lib/ai/sourceScope';
import { isRezidentiatQuiz } from '../lib/rezidentiatBank';
import { isFlashcardDeck } from '../lib/deckKind';
import { isChapterDeck } from '../lib/chapterDecks';
import { buildDueItems } from '../lib/dueItems';
import { effectiveStreak } from '../lib/gamificationProgress';
import { localDateStr } from '../lib/studyPlan';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useCountUp } from '../hooks/useCountUp';
import { useViewportProfile } from '../hooks/useViewportProfile';

function DashboardActions({ compact }: { compact: boolean }) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  return (
    <div
      className={`${calmMotion ? '' : 'fx-rise '}flex flex-wrap items-center ${compact ? 'mb-7 gap-3' : 'mb-9 gap-4'}`}
      style={{ '--i': 4 } as React.CSSProperties}
    >
      <span data-tutorial="btn-new-quiz" className="inline-flex">
        <MagneticButton
          to="/create"
          className={`press-feedback flex items-center gap-2.5 rounded-[var(--r-lg)] ${compact ? 'px-6 py-3.5' : 'px-8 py-4'} text-[11px] font-black uppercase tracking-wider text-white`}
          style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}
        >
          <Plus size={18} strokeWidth={3} /> Creează grilă
        </MagneticButton>
      </span>
      <div data-tutorial="btn-import"><ImportQuizButton /></div>
      <MagneticButton
        to="/quizzes"
        className={`press-feedback glass-panel flex items-center gap-2.5 rounded-[var(--r-lg)] ${compact ? 'px-6 py-3.5' : 'px-8 py-4'} text-xs font-bold uppercase tracking-wider`}
        style={{ color: theme.text }}
      >
        <BookOpen size={16} /> Explorează
      </MagneticButton>
    </div>
  );
}

function RecentQuizzesSection({
  recentQuizzes,
  onStartTutorial,
}: {
  recentQuizzes: ReturnType<typeof useQuizStore.getState>['quizzes'];
  onStartTutorial: () => void;
}) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  return (
    <section data-tutorial="dashboard-recent" className={calmMotion ? '' : 'fx-rise'} style={{ '--i': 5 } as React.CSSProperties}>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Grile recente</SectionLabel>
        <Link to="/quizzes" className="press-feedback text-xs font-bold uppercase tracking-widest hover:underline" style={{ color: theme.accentText }}>
          Vezi tot
        </Link>
      </div>
      {recentQuizzes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {recentQuizzes.map((quiz, index) => <QuizCard key={quiz.id} quiz={quiz} index={index} />)}
        </div>
      ) : (
        <div className="space-y-3">
          <EmptyState
            icon={BookOpen}
            title="Începe călătoria ta medicală"
            body="Cel mai rapid mod: fă o poză grilelor sau aruncă un PDF/Word — ți le recunosc automat."
            primary={{ label: 'Creează prima grilă', to: '/create' }}
            secondary={{ label: 'Tur rapid', onClick: onStartTutorial }}
          />
          <div className="mx-auto max-w-sm">
            <MagicImportCard />
          </div>
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const theme = useTheme();
  const { compact, mobile } = useViewportProfile();
  const username = useUserStore((s) => s.username);
  const activeProfileId = useUserStore((s) => s.activeProfileId);
  const studyPlan = useOrganizareStore((state) => (activeProfileId ? state.byProfile[activeProfileId]?.summary ?? null : null));
  const [now, setNow] = useState(() => new Date());
  const quizzes = useQuizStore((s) => s.quizzes);
  const sessions = useQuizStore((s) => s.sessions);
  const _hasHydrated = useQuizStore((s) => s._hasHydrated);
  const streak = useStatsStore((s) => s.streak);
  const totalStudyTime = useStatsStore((s) => s.totalStudyTime);
  const questionStats = useStatsStore((s) => s.questionStats);
  const knowledgeSources = useScopedSources('general');
  const startTutorial = useTutorialStore((state) => state.startTutorial);

  const accuracy = useStatsStore((s) => s.getAccuracy());
  const studyHours = Math.floor(totalStudyTime / 3600);
  const studyMinutes = Math.floor(totalStudyTime / 60);

  // Real week-over-week deltas. Every stat card used to show a fixed "▲ 2%".
  const trends = useMemo(() => computeDashboardTrends(quizzes, sessions), [quizzes, sessions]);

  const quizOnlyCount = useMemo(() => quizzes.filter((q) => !q.archived && !isFlashcardDeck(q) && !isRezidentiatQuiz(q)).length, [quizzes]);
  const animatedQuizzes = useCountUp(quizOnlyCount);
  // currentStreak is only recalculated when a session is recorded: after a skipped day it stays stale.
  const liveStreak = effectiveStreak(streak, localDateStr());
  const animatedStreak = useCountUp(liveStreak);
  const animatedAccuracy = useCountUp(accuracy);
  const animatedStudyHours = useCountUp(studyHours);
  const animatedStudyMinutes = useCountUp(studyMinutes);

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(intervalId);
  }, []);
  const hour = now.getHours();

  // Same list as the Recapitulare page: only real, still existing multiple-choice questions.
  const dueCount = useMemo(() => buildDueItems(questionStats ?? {}, quizzes).length, [questionStats, quizzes]);

  // What the tip strip is allowed to talk about: no chapter tips without a
  // library, no mistake tips before anything was answered wrong.
  const tipContext = useMemo(() => ({
    hasQuizzes: quizzes.some((quiz) => !isFlashcardDeck(quiz)),
    hasFlashcards: quizzes.some((quiz) => isFlashcardDeck(quiz)),
    hasLibrary: knowledgeSources.some((source) => source.indexStatus === 'ready'),
    hasMistakes: Object.values(questionStats ?? {}).some((stat) => !stat?.retired && (stat?.timesWrong ?? 0) > 0),
    dueCount,
    mobile,
  }), [quizzes, knowledgeSources, questionStats, dueCount, mobile]);

  const recentQuizzes = useMemo(
    // Pachetul-sursă arhivat după împărțirea pe capitole și pachetele de capitol nu inundă lista de recente.
    () => quizzes
      .filter((quiz) => !quiz.archived && !isChapterDeck(quiz) && !isRezidentiatQuiz(quiz))
      .sort((left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt))
      .slice(0, 4),
    [quizzes],
  );

  const greeting = hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Bună ziua' : 'Bună seara';
  const stats: DashboardStat[] = [
    { label: 'Grile', numeric: quizOnlyCount, display: String(animatedQuizzes), suffix: '', color: theme.accentText, delta: trends.quizzes },
    // A streak has no meaningful week-over-week percentage — the number itself
    // already says everything, so it carries no badge.
    { label: 'Serie', numeric: liveStreak, display: `${animatedStreak} ${animatedStreak === 1 ? 'zi' : 'zile'}`, suffix: '', color: theme.warning },
    { label: 'Acuratețe', numeric: accuracy, display: accuracy > 0 ? `${animatedAccuracy}%` : '-', suffix: '%', color: theme.success, delta: trends.accuracy, deltaUnit: 'pp' },
    { label: 'Timp studiu', numeric: studyHours, display: studyHours > 0 ? `${animatedStudyHours}h` : `${animatedStudyMinutes}m`, suffix: 'h', color: theme.accent2, delta: trends.studyTime },
  ];

  if (!_hasHydrated) {
    return (
      <FxPage>
        <PageSkeleton blocks={4} />
      </FxPage>
    );
  }

  const title = username ? `${greeting}, ${username}` : greeting;
  const subtitle = now.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <DashboardErrorBoundary>
      <FxPage className="px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-4xl">
          <PageHeader eyebrow="Panou" title={title} subtitle={subtitle} tour={{ id: 'dashboard', label: 'Vezi turul Panoului' }} />
          <DashboardTipStrip context={tipContext} />
          <div data-tutorial="dashboard-today" className="empty:hidden"><DashboardTodayCard dueCount={dueCount} plan={studyPlan} today={now} /></div>
          <DashboardCrunchCard />
          <div data-tutorial="dashboard-coach"><DashboardHeroCard /></div>
          <div data-tutorial="dashboard-stats"><DashboardStatStrip stats={stats} /></div>
          <div data-tutorial="dashboard-consistency"><StudyConsistencyMap compact={compact} /></div>
          <DashboardActions compact={compact} />
          <RecentQuizzesSection recentQuizzes={recentQuizzes} onStartTutorial={startTutorial} />
        </div>
      </FxPage>
    </DashboardErrorBoundary>
  );
}
