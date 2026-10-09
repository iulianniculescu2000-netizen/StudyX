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

export default function Sidebar() {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const { compact } = useViewportProfile();
  const username = useUserStore((s) => s.username);
  const logout = useUserStore((s) => s.logout);
  const folders = useFolderStore((s) => s.folders);
  const quizzes = useQuizStore((s) => s.quizzes);
  const moveToFolder = useQuizStore((s) => s.moveToFolder);
  const streak = useStatsStore((s) => s.streak);
  const liveStreak = effectiveStreak(streak, localDateStr());
  const addToast = useToastStore((state) => state.addToast);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
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

  return (
    <motion.div
      ref={rootRef}
      animate={{ width: collapsed ? 64 : compact ? 242 : 260 }}
      transition={calmMotion ? { duration: dur.instant } : t.panel}
      className="studyx-sidebar flex flex-col flex-shrink-0 select-none overflow-hidden glass-panel"
      style={{
        height: '100dvh',
        borderRight: '1px solid var(--hairline)',
        boxShadow: 'var(--elev-1)',
        position: 'relative',
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

      <SidebarFooter collapsed={collapsed} toggleCollapsed={toggleCollapsed} logout={logout} />
    </motion.div>
  );
}
