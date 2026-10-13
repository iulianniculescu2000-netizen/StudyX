import { lazy, Suspense, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../theme/ThemeContext';
import { useUserStore } from '../store/userStore';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useToastStore } from '../store/toastStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useViewportProfile } from '../hooks/useViewportProfile';
import { effectiveStreak } from '../lib/gamificationProgress';
import { localDateStr } from '../lib/studyPlan';
import { dur } from '../theme/motion';
import { useSidebarCollapsed } from './sidebar/useSidebarCollapsed';
import { useSidebarData } from './sidebar/useSidebarData';
import { useFolderDragDrop } from './sidebar/useFolderDragDrop';
import SidebarHeader from './sidebar/SidebarHeader';
import SidebarNav from './sidebar/SidebarNav';
import FolderTree from './sidebar/FolderTree';
import SidebarFooter from './sidebar/SidebarFooter';
import NewFolderDialogHost from './sidebar/NewFolderDialogHost';

const AISettings = lazy(() => import('./AISettings'));
const UpdateModal = lazy(() => import('./UpdateModal'));

/** Sub această lățime bara laterală se restrânge singură; se poate deschide peste conținut (suprapunere). */
const AUTO_COLLAPSE_BELOW = 900;
const RAIL_WIDTH = 64;

export default function Sidebar() {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const { compact, viewport } = useViewportProfile();
  const narrowScreen = viewport.width < AUTO_COLLAPSE_BELOW;
  const username = useUserStore((s) => s.username);
  const logout = useUserStore((s) => s.logout);
  const folders = useFolderStore((s) => s.folders);
  const quizzes = useQuizStore((s) => s.quizzes);
  const moveToFolder = useQuizStore((s) => s.moveToFolder);
  const streak = useStatsStore((s) => s.streak);
  const liveStreak = effectiveStreak(streak, localDateStr());
  const addToast = useToastStore((state) => state.addToast);
  const [storedCollapsed, toggleStoredCollapsed] = useSidebarCollapsed();
  const [overlayOpen, setOverlayOpen] = useState(false);
  // Pe ecran îngust preferința salvată nu se aplică: bara e restrânsă, iar deschiderea e temporară.
  const collapsed = narrowScreen ? !overlayOpen : storedCollapsed;
  const overlay = narrowScreen && overlayOpen;
  const toggleCollapsed = narrowScreen ? () => setOverlayOpen((open) => !open) : toggleStoredCollapsed;
  const {
    dueCount, totalAnswered, activeQuizCount, newQuizCount, uncategorizedCount, folderQuizCount, visibleFolders,
  } = useSidebarData();
  const { dropTargetId, handleFolderDragOver, handleFolderDragLeave, handleFolderDrop } = useFolderDragDrop({
    quizzes, folders, moveToFolder, addToast,
  });

  const [showAISettings, setShowAISettings] = useState(false);

  // The two layouts (icons only / full) are separate trees, so the width alone
  // glides while the content pops. Fade the content in as the width settles.
  const rootRef = useRef<HTMLDivElement>(null);
  const lastCollapsedRef = useRef(collapsed);
  useLayoutEffect(() => {
    if (lastCollapsedRef.current === collapsed) return;
    lastCollapsedRef.current = collapsed;
    const root = rootRef.current;
    if (!root || typeof root.animate !== 'function') return;
    const targets = root.querySelectorAll<HTMLElement>(':scope > :not(:first-child), [data-sidebar-fade]');
    targets.forEach((el) => {
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: calmMotion ? 160 : 300,
        delay: calmMotion ? 0 : collapsed ? 140 : 80,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'backwards',
      });
    });
  }, [collapsed, calmMotion]);

  useEffect(() => {
    const handler = () => setShowAISettings(true);
    window.addEventListener('studyx:open-ai-settings', handler);
    return () => window.removeEventListener('studyx:open-ai-settings', handler);
  }, []);

  useEffect(() => {
    if (!overlay) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOverlayOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);

  return (
    <div
      className="flex-shrink-0"
      style={narrowScreen ? { position: 'relative', width: RAIL_WIDTH, height: '100dvh', zIndex: 50 } : { display: 'contents' }}
    >
    {overlay && (
      <div
        aria-hidden
        onClick={() => setOverlayOpen(false)}
        style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'var(--overlay)' }}
      />
    )}
    <motion.div
      ref={rootRef}
      onClickCapture={(event) => {
        if (overlay && (event.target as HTMLElement).closest('a')) setOverlayOpen(false);
      }}
      animate={{ width: collapsed ? RAIL_WIDTH : compact ? 224 : 240 }}
      transition={calmMotion ? { duration: dur.instant } : t.panel}
      className="studyx-sidebar flex flex-col flex-shrink-0 select-none overflow-hidden glass-panel"
      style={{
        height: '100dvh',
        borderRight: '1px solid var(--hairline)',
        boxShadow: overlay ? 'var(--elev-4)' : 'var(--elev-1)',
        position: narrowScreen ? 'absolute' : 'relative',
        top: narrowScreen ? 0 : undefined,
        left: narrowScreen ? 0 : undefined,
        zIndex: 50,
        background: collapsed ? theme.navBg : `linear-gradient(180deg, ${theme.navBg}, color-mix(in srgb, ${theme.surface} 88%, transparent))`,
      } as React.CSSProperties}
    >
      <SidebarHeader
        collapsed={collapsed}
        compact={compact}
        username={username}
        liveStreak={liveStreak}
        totalAnswered={totalAnswered}
        logout={logout}
      />

      <SidebarNav
        collapsed={collapsed}
        compact={compact}
        dueCount={dueCount}
        activeQuizCount={activeQuizCount}
        newQuizCount={newQuizCount}
      >
        <FolderTree
          visibleFolders={visibleFolders}
          folderQuizCount={folderQuizCount}
          uncategorizedCount={uncategorizedCount}
          dropTargetId={dropTargetId}
          handleFolderDragOver={handleFolderDragOver}
          handleFolderDragLeave={handleFolderDragLeave}
          handleFolderDrop={handleFolderDrop}
        />
      </SidebarNav>

      <Suspense fallback={null}>
        <AISettings open={showAISettings} onClose={() => setShowAISettings(false)} />
      </Suspense>

      {/* Update modal */}
      <Suspense fallback={null}>
        <UpdateModal />
      </Suspense>

      {/* Centered folder creation modal */}
      <NewFolderDialogHost />

      <SidebarFooter collapsed={collapsed} toggleCollapsed={toggleCollapsed} logout={logout} compact={compact} />
    </motion.div>
    </div>
  );
}
