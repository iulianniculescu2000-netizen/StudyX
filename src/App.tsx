import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation as useRouterLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { useUserStore } from './store/userStore';
import { useFocusModeStore } from './store/focusModeStore';
import { useTutorialStore } from './store/tutorialStore';
import { useQuizStore } from './store/quizStore';
import { useToastStore } from './store/toastStore';
import { useSaveStatusStore } from './store/saveStatusStore';
import TitleBar from './components/TitleBar';
import WindowControls from './components/WindowControls';
import Sidebar from './components/Sidebar';
import { useFlashcardFolderMigration } from './hooks/useFlashcardFolderMigration';
import AnimatedBackground from './components/AnimatedBackground';
import ToastContainer from './components/ToastContainer';
import GlobalUploadIndicator from './components/app/GlobalUploadIndicator';
import { useVaultUploadStore } from './store/vaultUploadStore';
import TitleTooltips from './components/TitleTooltips';
import DropzoneOverlay from './components/DropzoneOverlay';
import Welcome from './pages/Welcome';
import ProfileSelect from './pages/ProfileSelect';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import SplashScreen from './components/SplashScreen';
import StudyXHandCursor from './components/cursor/StudyXHandCursor';
import { useAutoBackup } from './hooks/useAutoBackup';
import ScrollToTopButton from './components/app/ScrollToTopButton';
import { useAchievementWatcher, useStudyLevel } from './store/achievementsStore';
import TitleManager from './components/app/TitleManager';
import BookViewerHost from './components/pdf/BookViewerHost';
import { AppErrorBoundary, PageRoute, RouteSuspense } from './components/app/RouteShell';
import ChatErrorBoundary from './components/ai-chat/ChatErrorBoundary';
import { useProfileLifecycle } from './hooks/useProfileLifecycle';
import { useTutorialBootstrap } from './hooks/useTutorialBootstrap';
import { useAdaptiveMotion } from './hooks/useAdaptiveMotion';
import { cancelIdleTask, scheduleIdleTask } from './lib/idleTaskScheduler';
import { runStartupHealthCheck } from './lib/startupHealthCheck';
import { useDiagnosticsStore } from './store/diagnosticsStore';
import { getHealthBadgeLabel } from './lib/healthReporter';
import { useRuntimeStore } from './store/runtimeStore';
import { beginStartupSession, completeStartupSession, inspectPreviousStartup } from './lib/startupSessionGuard';
import { useUpdateStore } from './store/updateStore';
import { migrateLegacyUserMemory } from './ai/UserProfile';
import { checkModelAvailability } from './lib/ai/modelHealing';

const AIChatDrawer = lazy(() => import('./components/AIChatDrawer'));
const WhatsNewTour = lazy(() => import('./components/WhatsNewTour'));
const WelcomeFilm = lazy(() => import('./components/film/WelcomeFilm'));
const GlobalSearch = lazy(() => import('./components/GlobalSearch'));
const TourEngine = lazy(() => import('./tutorial/TourEngine'));

const Dashboard = lazy(() => import('./pages/Dashboard'));
const QuizList = lazy(() => import('./pages/QuizList'));
const QuizDetail = lazy(() => import('./pages/QuizDetail'));
const QuizCreate = lazy(() => import('./pages/QuizCreate'));
const QuizPlay = lazy(() => import('./pages/QuizPlay'));
const QuizResults = lazy(() => import('./pages/QuizResults'));
const FolderView = lazy(() => import('./pages/FolderView'));
const Stats = lazy(() => import('./pages/Stats'));
const ReviewMode = lazy(() => import('./pages/ReviewMode'));
const ErrorNotebook = lazy(() => import('./pages/ErrorNotebook'));
const ExamSimulation = lazy(() => import('./pages/ExamSimulation'));
const DailyReview = lazy(() => import('./pages/DailyReview'));
const ExamCrunch = lazy(() => import('./pages/ExamCrunch'));
const FlashcardHub = lazy(() => import('./pages/FlashcardHub'));
const KnowledgeVault = lazy(() => import('./pages/KnowledgeVault'));
const Residency = lazy(() => import('./pages/Residency'));
const ResidencyDiscipline = lazy(() => import('./pages/ResidencyDiscipline'));
const Organizare = lazy(() => import('./pages/Organizare'));
const FlashcardSession = lazy(() => import('./pages/FlashcardSession'));
const Notes = lazy(() => import('./pages/Notes'));
const Settings = lazy(() => import('./pages/Settings'));
const AIGamification = lazy(() => import('./components/gamification/AIGamification'));
const AIPredictiveAnalytics = lazy(() => import('./components/analytics/AIPredictiveAnalytics'));

function AppContent({ splashVisible }: { splashVisible: boolean }) {
  const profiles = useUserStore((state) => state.profiles);
  const activeProfileId = useUserStore((state) => state.activeProfileId);
  const pendingTutorialProfileId = useUserStore((state) => state.pendingTutorialProfileId);
  const clearPendingTutorialProfile = useUserStore((state) => state.clearPendingTutorialProfile);
  const username = useUserStore((state) => state.username);
  const addToast = useToastStore((state) => state.addToast);
  const setHealthReport = useDiagnosticsStore((state) => state.setHealthReport);
  const checkForUpdate = useUpdateStore((state) => state.checkForUpdate);
  const setShowUpdateModal = useUpdateStore((state) => state.setShowUpdateModal);
  const updateStatus = useUpdateStore((state) => state.status);
  const safeStartupEnabled = useRuntimeStore((state) => state.featureFlags.safeStartup);
  const resetSaveStatus = useSaveStatusStore((state) => state.reset);
  const startTutorial = useTutorialStore((state) => state.startTutorial);
  const hasHydrated = useTutorialStore((state) => state._hasHydrated);

  const [, setIsSwapping] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);

  // Real input for Perspective AI: it used to get a hardcoded `currentLevel={5}`.
  // The level comes from the same function the Realizări page uses
  // (lib/gamificationProgress), so the two pages never disagree.
  const predictiveLevel = useStudyLevel().level;
  useAchievementWatcher();

  const handleGlobalDrop = async (files: File[]) => {
    if (!activeProfileId || files.length === 0) return;
    void useVaultUploadStore.getState().enqueueFiles(files);
  };

  useAutoBackup(activeProfileId ?? null);

  // One-time port of the legacy userMemory.ts IndexedDB record (study patterns, rolling
  // aggregates) into the unified AI profile. No-op after the first run (guarded internally
  // by schemaVersion) and safe to fire on every mount.
  useEffect(() => {
    if (!activeProfileId) return;
    void migrateLegacyUserMemory(activeProfileId);
  }, [activeProfileId]);

  // Reclaim flashcard images whose deck no longer exists. Deletion is deferred
  // for undoable removals, and this was never called at all, so pictures from
  // deleted decks used to sit in IndexedDB forever.
  useEffect(() => {
    if (!activeProfileId) return;
    const timer = window.setTimeout(() => useQuizStore.getState().cleanupOrphanImages(), 8000);
    return () => window.clearTimeout(timer);
  }, [activeProfileId]);

  // Auto-check for updates 10s after startup (packaged builds only)
  useEffect(() => {
    if (!window.electronAPI?.updaterCheck) return;
    if (updateStatus !== 'idle') return;
    const timer = window.setTimeout(async () => {
      await checkForUpdate();
      if (useUpdateStore.getState().status === 'available') {
        addToast('Actualizare disponibilă pentru StudyX!', 'info', 6000);
        // Show the update modal after a short delay so the toast is visible first
        window.setTimeout(() => setShowUpdateModal(true), 1200);
      }
    }, 10000);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useProfileLifecycle({
    activeProfileId,
    setIsSwapping,
    resetSaveStatus,
    addToast,
  });

  useFlashcardFolderMigration(activeProfileId ?? null);

  useTutorialBootstrap({
    activeProfileId,
    pendingTutorialProfileId,
    clearPendingTutorialProfile,
    username: username ?? '',
    splashVisible,
    addingProfile,
    hasHydrated,
    startTutorial,
  });

  const focusMode = useFocusModeStore((state) => state.focusMode);
  const theme = useTheme();
  const location = useRouterLocation();
  const { calmMotion, t } = useAdaptiveMotion();

  useEffect(() => {
    if (username && activeProfileId && addingProfile) {
      setAddingProfile(false);
    }
  }, [username, activeProfileId, addingProfile]);

  useEffect(() => {
    if (!safeStartupEnabled || splashVisible) return;
    const handle = scheduleIdleTask(() => {
      void runStartupHealthCheck().then((report) => {
        setHealthReport(report.status, report.checks);
        if (report.status !== 'healthy') {
          addToast(`${getHealthBadgeLabel(report.status)}. Vezi secțiunea de stabilitate din Setări.`, 'warning', 5200);
        }
      }).catch((error) => {
        setHealthReport('degraded', [{
          id: 'startup-health-check',
          label: 'Startup health check',
          status: 'error',
          detail: error instanceof Error ? error.message : 'Startup health check failed.',
        }]);
      });
    }, { dedupeKey: 'startup-health-check', timeoutMs: 1600 });

    return () => cancelIdleTask(handle);
  }, [addToast, safeStartupEnabled, setHealthReport, splashVisible]);

  useEffect(() => {
    if (splashVisible) return;
    // Proactive layer of model self-healing (see lib/ai/modelHealing.ts): asks
    // the configured provider which models are still live and swaps away from
    // one it has quietly deprecated/decommissioned before the user's next AI
    // request would have failed on it. Throttled to once/day internally.
    const handle = scheduleIdleTask(() => { void checkModelAvailability(); }, {
      dedupeKey: 'model-availability-check',
      timeoutMs: 2000,
    });
    return () => cancelIdleTask(handle);
  }, [splashVisible]);

  // Paginile sunt lazy: după pornire le încărcăm pe rând, în pauze, ca la prima vizită să nu apară scheletul.
  useEffect(() => {
    if (splashVisible) return;
    const loaders = [
      () => import('./pages/QuizList'), () => import('./pages/Stats'), () => import('./pages/FlashcardHub'),
      () => import('./pages/Residency'), () => import('./pages/ResidencyDiscipline'), () => import('./pages/Organizare'),
      () => import('./pages/KnowledgeVault'), () => import('./pages/Settings'), () => import('./pages/FolderView'),
      () => import('./pages/QuizDetail'), () => import('./pages/Notes'), () => import('./pages/DailyReview'),
    ];
    let cancelled = false;
    let idle = -1;
    let timer: number | undefined;
    const next = (i: number) => {
      if (cancelled || i >= loaders.length) return;
      idle = scheduleIdleTask(() => {
        void loaders[i]().catch(() => undefined);
        timer = window.setTimeout(() => next(i + 1), 150);
      }, { timeoutMs: 3000 });
    };
    next(0);
    return () => {
      cancelled = true;
      cancelIdleTask(idle);
      window.clearTimeout(timer);
    };
  }, [splashVisible]);

  // Keep onboarding mounted through the splash so early typing and profile
  // selection survive the reveal instead of resetting their local state.

  if (profiles.length === 0 || (addingProfile && !activeProfileId)) {
    return (<><Welcome onBack={profiles.length > 0 ? () => setAddingProfile(false) : undefined} /><TitleTooltips /></>);
  }

  if (!activeProfileId) {
    return (<><ProfileSelect onAddNew={() => setAddingProfile(true)} /><TitleTooltips /></>);
  }

  return (
    <div className={`flex flex-1 overflow-hidden ${theme.isDark ? 'dark' : ''}`}>
      {!splashVisible && <TitleManager />}
      <ScrollToTopButton />
      {!splashVisible && <AnimatedBackground />}
      <DropzoneOverlay onFilesDropped={handleGlobalDrop} />

      {!focusMode && <Sidebar />}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
        {!focusMode && <TitleBar />}
        <Suspense fallback={null}>
          <GlobalSearch />
        </Suspense>
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <AppErrorBoundary resetKey={location.pathname}>
            {/* Suspense persistent (nu e sub `key`): la navigare pagina veche rămâne vizibilă până e gata cea nouă.
                Intrare fără ieșire: pagina nouă urcă ușor (doar translate, fără fade, ca să nu pară spălată). */}
            <RouteSuspense>
            <motion.div
              key={location.pathname}
              initial={calmMotion ? false : { y: 8 }}
              animate={{ y: 0 }}
              transition={t.page}
              style={{ height: '100%' }}
            >
                <Routes location={location}>
                  <Route path="/" element={<PageRoute><Dashboard /></PageRoute>} />
                  <Route path="/quizzes" element={<PageRoute><QuizList /></PageRoute>} />
                  <Route path="/quiz/:id" element={<PageRoute><QuizDetail /></PageRoute>} />
                  <Route path="/folder/:id" element={<PageRoute><FolderView /></PageRoute>} />
                  <Route path="/create" element={<PageRoute><QuizCreate /></PageRoute>} />
                  <Route path="/play/:id" element={<PageRoute><QuizPlay /></PageRoute>} />
                  <Route path="/results/:id" element={<PageRoute><QuizResults /></PageRoute>} />
                  <Route path="/stats" element={<PageRoute><Stats /></PageRoute>} />
                  <Route path="/review" element={<PageRoute><ReviewMode /></PageRoute>} />
                  <Route path="/erori" element={<PageRoute><ErrorNotebook /></PageRoute>} />
                  <Route path="/simulare" element={<PageRoute><ExamSimulation /></PageRoute>} />
                  <Route path="/aproape-examen" element={<PageRoute><ExamCrunch /></PageRoute>} />
                  <Route path="/daily-review" element={<PageRoute><DailyReview /></PageRoute>} />
                  <Route path="/vault" element={<PageRoute><KnowledgeVault /></PageRoute>} />
                  <Route path="/rezidentiat" element={<PageRoute><Residency /></PageRoute>} />
                  <Route path="/rezidentiat/organizare" element={<PageRoute><Organizare /></PageRoute>} />
                  <Route path="/rezidentiat/flashcarduri" element={<PageRoute><FlashcardHub scope="rezidentiat" /></PageRoute>} />
                  <Route path="/rezidentiat/:folderId" element={<PageRoute><ResidencyDiscipline /></PageRoute>} />
                  <Route path="/flashcards" element={<PageRoute><FlashcardHub /></PageRoute>} />
                  <Route path="/flashcards/session/:id" element={<PageRoute><FlashcardSession /></PageRoute>} />
                  <Route path="/notes" element={<PageRoute><Notes /></PageRoute>} />
                  <Route path="/settings" element={<PageRoute><Settings /></PageRoute>} />
                  <Route path="/gamification" element={<PageRoute><AIGamification userId={activeProfileId || ''} username={username || ''} /></PageRoute>} />
                  <Route path="/analytics" element={<PageRoute><AIPredictiveAnalytics userId={activeProfileId} currentLevel={predictiveLevel} /></PageRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </motion.div>
            </RouteSuspense>
          </AppErrorBoundary>
        </main>
      </div>
      {!splashVisible && (
        <ChatErrorBoundary>
          <Suspense fallback={null}>
            <AIChatDrawer />
          </Suspense>
        </ChatErrorBoundary>
      )}
      <ToastContainer />
      <GlobalUploadIndicator />
      <TitleTooltips />
      <BookViewerHost />
      <KeyboardShortcuts />
      {activeProfileId && !splashVisible && (
        <Suspense fallback={null}>
          <TourEngine profileId={activeProfileId} />
          <WelcomeFilm />
          <WhatsNewTour />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true);
  const safeStartupEnabled = useRuntimeStore((state) => state.featureFlags.safeStartup);
  const setLowPowerModeForThisSessionOnly = useRuntimeStore((state) => state.setLowPowerModeForThisSessionOnly);
  const setHealthReport = useDiagnosticsStore((state) => state.setHealthReport);
  const addToast = useToastStore((state) => state.addToast);
  const { calmMotion } = useAdaptiveMotion();
  // A splash that vanishes the instant the JS bundle finishes evaluating reads
  // as a stutter, not a launch — the heaviest mount work (store hydration,
  // route matching) lands in the same frame as the fade-out. Giving it a real
  // felt duration (still snappy under reduced-motion/low-power) lets that work
  // finish underneath the splash instead of janking the reveal.
  const splashDurationMs = calmMotion ? 650 : 2200;

  useEffect(() => {
    if (safeStartupEnabled) {
      const startupState = inspectPreviousStartup();
      // În dezvoltare, start.bat și reîncărcările opresc forțat Electron: nu e o cădere reală și nu trebuie să oprească animațiile.
      if (startupState.hadUncleanExit && !import.meta.env.DEV) {
        setLowPowerModeForThisSessionOnly();
        setHealthReport('degraded', [{
          id: 'unclean-startup',
          label: 'Pornire anterioară incompletă',
          status: 'error',
          detail: 'Ultima sesiune nu s-a închis curat. Am activat mod economisire pentru stabilitate.',
        }]);
        addToast('Am detectat o pornire anterioară incompletă. Activăm un profil mai sigur pentru sesiunea asta.', 'warning', 5600);
      }
    }

    beginStartupSession();
    window.electronAPI?.appReady();
    const timer = setTimeout(() => setSplashVisible(false), splashDurationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- splashDurationMs is fixed for the lifetime of this mount (calmMotion doesn't change mid-boot)
  }, [addToast, safeStartupEnabled, setHealthReport, setLowPowerModeForThisSessionOnly]);

  useEffect(() => {
    if (splashVisible) return;
    const timer = window.setTimeout(() => completeStartupSession(), 600);
    return () => window.clearTimeout(timer);
  }, [splashVisible]);

  return (
    <HashRouter>
      <ThemeProvider>
        {/* Honour the system "reduce motion" setting for every framer-motion animation (entrances, staggers, layout). */}
        <MotionConfig reducedMotion={calmMotion ? 'always' : 'user'}>
          <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'transparent' }}>
            <WindowControls />
            <SplashScreen visible={splashVisible} durationMs={splashDurationMs} />
            <AppContent splashVisible={splashVisible} />
            <StudyXHandCursor />
          </div>
        </MotionConfig>
      </ThemeProvider>
    </HashRouter>
  );
}
