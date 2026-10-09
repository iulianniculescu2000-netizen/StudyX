import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogOut, PanelLeftOpen, Settings } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useUpdateStore } from '../../store/updateStore';
import ThemeModeSwitcher from '../ThemeModeSwitcher';
import NavItem from './NavItem';
import Tip from './Tip';
import UpdateButton from './UpdateButton';

interface SidebarFooterProps {
  collapsed: boolean;
  toggleCollapsed: () => void;
  logout: () => void;
}

/** Bottom block: logout (collapsed), settings, updater, theme switch and the collapse toggle. */
export default function SidebarFooter({ collapsed, toggleCollapsed, logout }: SidebarFooterProps) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const updateStatus = useUpdateStore((s) => s.status);
  const localVersion = useUpdateStore((s) => s.localVersion);
  const downloadPercent = useUpdateStore((s) => s.downloadPercent);
  const setShowUpdateModal = useUpdateStore((s) => s.setShowUpdateModal);

  const setLocalVersion = useUpdateStore((s) => s.setLocalVersion);
  useEffect(() => {
    window.electronAPI?.updaterGetVersion()
      .then((v) => { if (v) setLocalVersion(v); })
      .catch((e) => console.error('[StudyX] Failed to get app version', e));
  }, [setLocalVersion]);

  return (
      <div className="p-2 flex-shrink-0 space-y-1" style={{ borderTop: `1px solid ${theme.border}` }}>
        {/* Logout (collapsed only) */}
        {collapsed && (
          <Tip label="Schimbă utilizatorul">
            <button onClick={logout}
              aria-label="Schimba utilizatorul"
              className="w-full flex items-center justify-center p-2.5 rounded-xl transition-colors press-feedback"
              style={{ color: theme.text3 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = theme.danger)}
              onMouseLeave={(e) => (e.currentTarget.style.color = theme.text3)}>
              <LogOut size={15} />
            </button>
          </Tip>
        )}

        {/* Settings — pinned here, separate from the Studiu/Resurse zones above */}
        <div data-tutorial="nav-settings">
          {collapsed ? (
            <Tip label="Setări">
              <NavItem to="/settings" icon={<Settings size={17} />} label="Setări" collapsed />
            </Tip>
          ) : (
            <NavItem to="/settings" icon={<Settings size={16} />} label="Setări" collapsed={false} />
          )}
        </div>

        {/* Update button */}
        <UpdateButton
          collapsed={collapsed}
          status={updateStatus}
          localVersion={localVersion}
          downloadPercent={downloadPercent}
          onOpen={() => setShowUpdateModal(true)}
          theme={theme}
        />

        {/* Aspect: Luminos / Întunecat / Automat */}
        <div className={collapsed ? 'flex justify-center py-1' : 'px-2 py-1'}>
          <ThemeModeSwitcher variant="compact" label={collapsed ? undefined : 'Aspect'} />
        </div>

        {/* Collapse toggle */}
        <Tip label={collapsed ? 'Extinde sidebar' : ''}>
          <motion.button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Extinde sidebar' : 'Restrange sidebar'}
            whileHover={{ backgroundColor: `${theme.accent}12` }}
            whileTap={calmMotion ? undefined : { scale: 0.94 }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm press-feedback focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
            style={{ color: theme.text3, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <motion.span
              animate={{ rotate: collapsed ? 0 : 180 }}
              transition={t.page}
              style={{ display: 'flex' }}>
              <PanelLeftOpen size={15} />
            </motion.span>
            {!collapsed && <span style={{ color: theme.text3 }}>Restrânge</span>}
          </motion.button>
        </Tip>
      </div>
  );
}
