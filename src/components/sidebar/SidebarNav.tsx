import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, BookOpen, BarChart3, RefreshCw,
  StickyNote, CreditCard, Database, Stethoscope, Trophy, TrendingUp, Brain,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useStatsStore } from '../../store/statsStore';
import { todayProgressPercent } from '../../lib/todayProgress';
import { NAV_HUE } from './constants';
import NavItem from './NavItem';
import Tip from './Tip';

interface SidebarNavProps {
  collapsed: boolean;
  compact: boolean;
  dueCount: number;
  activeQuizCount: number;
  newQuizCount: number;
  /** Rendered last inside the scrolling nav, only in the expanded layout (the folders section). */
  children?: ReactNode;
}

/** Scrolling navigation: daily-review ring + Studiu / Resurse entries (icons only when collapsed). */
export default function SidebarNav({ collapsed, compact, dueCount, activeQuizCount, newQuizCount, children }: SidebarNavProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  // Same "cleared vs. still due today" ratio the Dashboard hero ring shows —
  // reusing it here (smaller) so the two rings read as the same signal, not two.
  // Procent real: făcute azi / (făcute azi + restante). Fără date (nimic făcut, nimic restant) inelul rămâne gol și textul dispare.
  const doneToday = useStatsStore((state) => {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    let n = 0;
    for (const stat of Object.values(state.questionStats)) if (!stat.retired && stat.lastSeen >= startOfDay) n += 1;
    return n;
  });
  const ringPercent = todayProgressPercent(doneToday, dueCount);
  const ringRadius = 13;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - (ringPercent ?? 0) / 100);

  return (
    <div
      data-tutorial="sidebar"
      role="navigation"
      aria-label="Navigare principala"
      className={`flex-1 overflow-y-auto ${compact ? 'px-1.5 pb-1.5 pt-1.5' : 'px-2 pb-2 pt-2'} space-y-0.5 overflow-x-hidden`}
    >
        {collapsed ? (
          <Tip label={dueCount > 0 ? `${dueCount} de recapitulat azi` : 'Recapitulări la zi'}>
            <button type="button" onClick={() => navigate('/daily-review')} aria-label="Sesiune zilnică" className="mb-2.5 flex w-full items-center justify-center rounded-2xl p-2 press-feedback" style={{ background: 'var(--accent-soft)', border: `1px solid ${theme.accent}24` }}>
              <svg width={30} height={30} viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                <circle cx="20" cy="20" r={ringRadius} fill="none" stroke={theme.surface2} strokeWidth="5" />
                <motion.circle cx="20" cy="20" r={ringRadius} fill="none" stroke={theme.accent2} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringCircumference} initial={false} animate={{ strokeDashoffset: ringOffset }} transition={{ duration: 0.6, ease: 'easeOut' }} />
              </svg>
            </button>
          </Tip>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/daily-review')}
            className="mb-2 flex w-full items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 text-left press-feedback"
            style={{ background: 'var(--accent-soft)', border: `1px solid ${theme.accent}24` }}
          >
            <svg width={26} height={26} viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
              <circle cx="20" cy="20" r={ringRadius} fill="none" stroke={theme.surface2} strokeWidth="5" />
              <motion.circle cx="20" cy="20" r={ringRadius} fill="none" stroke={theme.accent2} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringCircumference} initial={false} animate={{ strokeDashoffset: ringOffset }} transition={{ duration: 0.6, ease: 'easeOut' }} />
            </svg>
            <div className="min-w-0">
              <div className="truncate text-[11.5px] font-bold" style={{ color: theme.text }}>
                {dueCount > 0 ? `${dueCount} de recapitulat` : 'Recapitulări la zi'}
              </div>
              {ringPercent !== null && (
                <div className="text-[9.5px] font-semibold" style={{ color: theme.text3 }}>
                  {ringPercent}% din azi, gata
                </div>
              )}
            </div>
          </button>
        )}

        {collapsed ? (
          <>
            <Tip label="Panou">
              <NavItem to="/" icon={<LayoutDashboard size={17} />} label="Panou" end collapsed hue={NAV_HUE.dashboard} />
            </Tip>
            <Tip label={`Toate grilele (${activeQuizCount})`}>
              <NavItem to="/quizzes" icon={<BookOpen size={17} />} label="Toate grilele" collapsed hue={NAV_HUE.quizzes} />
            </Tip>
            <Tip label={`Recapitulare${dueCount > 0 ? ` (${dueCount})` : ''}`}>
              <div data-tutorial="nav-review">
                <NavItem
                  to="/review"
                  icon={
                    <div className="relative">
                      <RefreshCw size={17} />
                      {dueCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
                          style={{ background: theme.warning }}>{dueCount}</span>
                      )}
                    </div>
                  }
                  label="Recapitulare"
                  collapsed
                  hue={NAV_HUE.review}

                />
              </div>
            </Tip>
            <Tip label={`Sesiune zilnică${dueCount > 0 ? ` - ${dueCount} de recapitulat` : ""}`}>
              <div data-tutorial="nav-daily-review">
                <NavItem
                  to="/daily-review"
                  icon={
                    <div className="relative">
                      <Brain size={17} />
                      {dueCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
                          style={{ background: theme.accent }}>{dueCount}</span>
                      )}
                    </div>
                  }
                  label="Sesiune zilnică"
                  collapsed
                  hue={NAV_HUE.dailyReview}
                />
              </div>
            </Tip>
            <Tip label="Statistici">
              <div data-tutorial="nav-stats">
                <NavItem to="/stats" icon={<BarChart3 size={17} />} label="Statistici" collapsed hue={NAV_HUE.stats} />
              </div>
            </Tip>
            <Tip label="Realizări">
              <NavItem to="/gamification" icon={<Trophy size={17} />} label="Realizări" collapsed hue={NAV_HUE.gamification} />
            </Tip>
            <Tip label="Perspective AI">
              <NavItem to="/analytics" icon={<TrendingUp size={17} />} label="Perspective AI" collapsed hue={NAV_HUE.analytics} />
            </Tip>

            {/* zone divider: Studiu ↑ / Resurse ↓ — a text label wouldn't fit collapsed, so a hairline stands in for it */}
            <div className="my-1.5 mx-3" style={{ height: 1, background: theme.border }} />

            <Tip label="Notițe">
              <div data-tutorial="nav-notes">
                <NavItem to="/notes" icon={<StickyNote size={17} />} label="Notițe" collapsed hue={NAV_HUE.notes} />
              </div>
            </Tip>
            <Tip label="Biblioteca AI">
              <div data-tutorial="nav-vault">
                <NavItem to="/vault" icon={<Database size={15} />} label="Biblioteca AI" collapsed={collapsed} hue={NAV_HUE.vault} />
              </div>
            </Tip>
            <Tip label="Rezidențiat">
              <div data-tutorial="nav-rezidentiat">
                <NavItem to="/rezidentiat" icon={<Stethoscope size={17} />} label="Rezidențiat" collapsed hue={NAV_HUE.rezidentiat} />
              </div>
            </Tip>
            <Tip label="Flashcarduri">
              <div data-tutorial="nav-flashcards">
                <NavItem to="/flashcards" icon={<CreditCard size={17} />} label="Flashcarduri" collapsed hue={NAV_HUE.flashcards} />
              </div>
            </Tip>
          </>
        ) : (
          <>
            <div className="mb-1 px-2.5 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: theme.text3, opacity: 0.55 }}>
              Studiu
            </div>
            <NavItem to="/" icon={<LayoutDashboard size={15} />} label="Panou" end collapsed={false} hue={NAV_HUE.dashboard} />
            <NavItem
              to="/quizzes"
              icon={<BookOpen size={15} />}
              label="Toate grilele"
              collapsed={false}
              hue={NAV_HUE.quizzes}

              badge={
                <div className="flex gap-1.5 items-center">
                  {newQuizCount > 0 && (
                    <span className="w-2 h-2 rounded-full" style={{ background: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }} title="Grile noi" />
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: theme.surface2, color: theme.text3 }}>
                    {activeQuizCount}
                  </span>
                </div>
              }
            />
            <div data-tutorial="nav-review">
              <NavItem
                to="/review"
                icon={<RefreshCw size={15} />}
                label="Recapitulare"
                collapsed={false}
                hue={NAV_HUE.review}

                badge={dueCount > 0 ? (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: `${theme.warning}28`, color: theme.warning }}>
                    {dueCount}
                  </span>
                ) : undefined}
              />
            </div>
            <div data-tutorial="nav-daily-review">
              <NavItem
                to="/daily-review"
                icon={<Brain size={15} />}
                label="Sesiune zilnică"
                collapsed={false}
                hue={NAV_HUE.dailyReview}

                badge={dueCount > 0 ? (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: `${theme.accent}28`, color: theme.accentText }}>
                    {dueCount}
                  </span>
                ) : undefined}
              />
            </div>
            <div data-tutorial="nav-stats"><NavItem to="/stats" icon={<BarChart3 size={15} />} label="Statistici" collapsed={false} hue={NAV_HUE.stats} /></div>
            <NavItem to="/gamification" icon={<Trophy size={15} />} label="Realizări" collapsed={false} hue={NAV_HUE.gamification} />
            <NavItem to="/analytics" icon={<TrendingUp size={15} />} label="Perspective AI" collapsed={false} hue={NAV_HUE.analytics} />

            <div className="mb-1 mt-4 px-2.5 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: theme.text3, opacity: 0.55 }}>
              Resurse
            </div>
            <div data-tutorial="nav-notes">
              <NavItem to="/notes" icon={<StickyNote size={15} />} label="Notițe" collapsed={false} hue={NAV_HUE.notes} />
            </div>

            <div data-tutorial="nav-vault">
              <NavItem to="/vault" icon={<Database size={15} />} label="Biblioteca AI" collapsed={false} hue={NAV_HUE.vault} />
            </div>
            <div data-tutorial="nav-rezidentiat"><NavItem to="/rezidentiat" icon={<Stethoscope size={15} />} label="Rezidențiat" collapsed={false} hue={NAV_HUE.rezidentiat} /></div>
            <div data-tutorial="nav-flashcards">
              <NavItem
                to="/flashcards"
                icon={<CreditCard size={15} />}
                label="Flashcarduri"
                collapsed={false}
                hue={NAV_HUE.flashcards}

              />
            </div>

            {children}
          </>
        )}
    </div>
  );
}
