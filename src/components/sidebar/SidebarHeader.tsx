import { Flame, LogOut } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import Logo from '../Logo';
import Tip from './Tip';

interface SidebarHeaderProps {
  collapsed: boolean;
  compact: boolean;
  username: string | null | undefined;
  liveStreak: number;
  totalAnswered: number;
  logout: () => void;
}

/** Logo/drag region plus the user card (avatar, streak or medical rank, logout). */
export default function SidebarHeader({ collapsed, compact, username, liveStreak, totalAnswered, logout }: SidebarHeaderProps) {
  const theme = useTheme();
  const avatarLetter = username?.charAt(0).toUpperCase() ?? '?';
  const medicalRank = totalAnswered > 1000 ? 'MEDIC PRIMAR' : totalAnswered > 500 ? 'MEDIC SPECIALIST' : totalAnswered > 100 ? 'MEDIC REZIDENT' : 'STUDENT LA MEDICINĂ';

  return (
    <>
      {/* Drag region matches TitleBar */}
      <div
        style={{
          height: compact ? 42 : 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          paddingLeft: collapsed ? 0 : compact ? 12 : 16,
          borderBottom: `1px solid ${theme.border}`,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties & { WebkitAppRegion: string }}
      >
        <Logo size={24} className="flex-shrink-0" />
        {!collapsed && (
          <span
            data-sidebar-fade
            className="text-base font-black ml-3 tracking-tighter"
            style={{ color: theme.text, WebkitAppRegion: 'no-drag' } as React.CSSProperties & { WebkitAppRegion: string }}
          >
            Study<span style={{ color: theme.accentText }}>X</span>
          </span>
        )}
      </div>

      {/* User header */}
      <div className={`${compact ? 'p-3' : 'p-4'} flex-shrink-0`} style={{ borderBottom: `1px solid ${theme.border}` }}>
        {collapsed ? (
          <Tip label={username ?? ''}>
            <div
              className="w-8 h-8 rounded-[var(--r-sm)] flex items-center justify-center font-bold text-white text-xs mx-auto cursor-pointer"
              style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}
            >
              {avatarLetter}
            </div>
          </Tip>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[var(--r-sm)] flex items-center justify-center font-bold text-white text-base flex-shrink-0"
              style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}
            >
              {avatarLetter}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate leading-tight" style={{ color: theme.text }}>{username}</p>
              {liveStreak > 0 ? (
                <p className={`flex items-center gap-1 mt-0.5 secondary-label ${liveStreak >= 3 ? 'animate-streak-fire' : ''}`} style={{ color: theme.warning }}>
                  <Flame size={10} fill={liveStreak >= 3 ? theme.warning : 'none'} />
                  {liveStreak} {liveStreak === 1 ? 'ZI' : 'ZILE'} DE SERIE
                </p>
              ) : (
                <p className="mt-0.5 secondary-label" style={{ opacity: 0.8 }}>{medicalRank}</p>
              )}
            </div>
            <button
              onClick={logout}
              aria-label="Schimba utilizatorul"
              className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
              style={{ color: theme.text3 }}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
