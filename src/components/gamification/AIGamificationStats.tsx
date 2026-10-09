import type { CSSProperties } from 'react';
import { BarChart3, Crosshair, Flame, Medal, Star, Zap, type LucideIcon } from 'lucide-react';
import ProgressRing from '../fx/ProgressRing';
import SectionLabel from '../ui/SectionLabel';
import { useCountUp } from '../../hooks/useCountUp';
import type { LevelInfo } from '../../lib/gamificationProgress';
import { useTheme } from '../../theme/ThemeContext';

export interface GamificationStats {
  points: number;
  level: LevelInfo;
  /** Streak that is still alive today. */
  streak: number;
  achievementsDone: number;
  achievementsTotal: number;
  /** `null` until the first answer is recorded. */
  accuracy: number | null;
  weeklyQuestions: number;
}

interface AIGamificationStatsProps {
  stats: GamificationStats;
}

interface TileProps {
  index: number;
  icon: LucideIcon;
  label: string;
  /** `null` renders as an em dash (no data), never as 0. */
  value: number | null;
  unit?: string;
  note?: string;
  ring?: number;
  ringLabel?: string;
  format?: (value: number) => string;
}

function Tile({ index, icon: Icon, label, value, unit, note, ring, ringLabel, format }: TileProps) {
  const theme = useTheme();
  const shown = useCountUp(value ?? 0);
  return (
    <div
      className="glass-panel fx-lift fx-spot fx-rise rounded-2xl p-4"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
          style={{ background: 'var(--accent-soft)', color: theme.accent }}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 text-balance break-words text-[12px] font-medium leading-tight" style={{ color: theme.text3 }}>{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1 tabular-nums" style={{ color: theme.text }}>
            <span className="text-[26px] font-semibold leading-none tracking-tight">
              {value === null ? '—' : format ? format(shown) : shown}
            </span>
            {value !== null && unit && (
              <span className="text-[12px] font-medium" style={{ color: theme.text3 }}>{unit}</span>
            )}
          </div>
          {note && <div className="mt-1.5 text-[11.5px]" style={{ color: theme.text3 }}>{note}</div>}
        </div>
        {ring !== undefined && <ProgressRing value={ring} size={44} stroke={5} label={ringLabel} />}
      </div>
    </div>
  );
}

export default function AIGamificationStats({ stats }: AIGamificationStatsProps) {
  const { level } = stats;
  const steps = level.toNext === 1 ? 'încă 1 pas' : `încă ${level.toNext} pași`;
  const streakUnit = stats.streak === 1 ? 'zi' : 'zile';

  return (
    <section aria-label="Progres" className="space-y-2.5">
      <SectionLabel>Progres</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile
          index={1}
          icon={Zap}
          label="Puncte"
          value={stats.points}
          format={(n) => n.toLocaleString('ro-RO')}
        />
        <Tile
          index={2}
          icon={Star}
          label="Nivel"
          value={level.level}
          note={steps}
          ring={level.progress}
          ringLabel={`Nivel ${level.level}, ${level.progress}% până la nivelul următor`}
        />
        <Tile index={3} icon={Flame} label="Serie" value={stats.streak} unit={streakUnit} />
        <Tile
          index={4}
          icon={Medal}
          label="Realizări"
          value={stats.achievementsDone}
          unit={`/${stats.achievementsTotal}`}
        />
        <Tile
          index={5}
          icon={Crosshair}
          label="Acuratețe"
          value={stats.accuracy}
          unit="%"
          note="Toate răspunsurile, tot istoricul"
        />
        <Tile index={6} icon={BarChart3} label="Întrebări în 7 zile" value={stats.weeklyQuestions} />
      </div>
    </section>
  );
}
