import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useQuizStore } from '../../store/quizStore';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, ease } from '../../theme/motion';
import { buildStudyHeatmap, toWeekColumns, type HeatmapDay } from '../../lib/studyHeatmap';

const WEEKDAY_LABELS = ['L', '', 'M', '', 'V', '', 'D'];
const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];

function formatDay(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * Eighteen weeks of study, one square per day.
 *
 * The streak counter answers "am I on a roll today"; this answers "what does my
 * month actually look like", which is the question that changes behaviour. A
 * student who sees two dark weeks after every exam learns something no number
 * on a card was telling them.
 */
export default function StudyConsistencyMap({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const sessions = useQuizStore((state) => state.sessions);
  const { calmMotion } = useAdaptiveMotion();
  const [hovered, setHovered] = useState<HeatmapDay | null>(null);

  const summary = useMemo(() => buildStudyHeatmap(sessions, compact ? 12 : 18), [sessions, compact]);
  const columns = useMemo(() => toWeekColumns(summary.days), [summary.days]);

  // Nothing studied yet: an empty grid would read as a broken widget.
  if (summary.totalQuestions === 0) return null;

  const levelStyle = (day: HeatmapDay) => {
    if (day.level === 0) {
      return { background: 'var(--fill-subtle)', border: '1px solid transparent' };
    }
    const opacity = [0, 0.28, 0.48, 0.72, 1][day.level];
    return {
      background: `color-mix(in srgb, ${theme.accent} ${Math.round(opacity * 100)}%, transparent)`,
      border: `1px solid ${theme.accent}${day.level >= 3 ? '55' : '22'}`,
    };
  };

  // Month labels above the first column of each new month.
  const monthMarks = columns.map((column, index) => {
    const first = column[0];
    const month = Number(first.date.slice(5, 7));
    const previous = index > 0 ? Number(columns[index - 1][0].date.slice(5, 7)) : null;
    return month !== previous ? MONTHS[month - 1] : '';
  });

  return (
    <div className="glass-panel mb-8 rounded-[var(--r-lg)] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text3 }}>
          Harta consistenței
        </span>
        <span className="text-[11px] font-bold" style={{ color: theme.text2 }}>
          {summary.activeDays} zile studiate · {summary.totalQuestions} întrebări
        </span>
        {summary.bestRun >= 2 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black"
            style={{ background: `${theme.warning}18`, color: theme.warning }}
          >
            <Flame size={10} />
            {summary.bestRun} zile la rând
          </span>
        )}
        <span className="ml-auto min-h-[16px] text-[11px] font-semibold" style={{ color: theme.text3 }}>
          {hovered
            ? hovered.questions > 0
              ? `${formatDay(hovered.date)} · ${hovered.questions} întrebări`
              : `${formatDay(hovered.date)} · pauză`
            : ''}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex flex-shrink-0 flex-col gap-[3px] pt-[14px]">
          {WEEKDAY_LABELS.map((label, index) => (
            <span
              key={index}
              className="flex h-[11px] items-center text-[8px] font-bold leading-none"
              style={{ color: theme.text3, width: 8 }}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex gap-[3px]">
          {columns.map((column, columnIndex) => (
            <div key={column[0].date} className="flex flex-col gap-[3px]">
              <span className="h-[10px] text-[8px] font-bold leading-none" style={{ color: theme.text3 }}>
                {monthMarks[columnIndex]}
              </span>
              {column.map((day) => (
                <motion.span
                  key={day.date}
                  initial={calmMotion ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: calmMotion ? 0 : Math.min(columnIndex * 0.012, 0.4), duration: calmMotion ? dur.instant : dur.fast, ease: ease.standard }}
                  onMouseEnter={() => setHovered(day)}
                  onMouseLeave={() => setHovered(null)}
                  title={`${formatDay(day.date)} · ${day.questions} întrebări`}
                  className="h-[11px] w-[11px] rounded-[3px] transition-opacity hover:opacity-70"
                  style={levelStyle(day)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-[9px] font-bold" style={{ color: theme.text3 }}>mai puțin</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="h-[9px] w-[9px] rounded-[2px]"
            style={levelStyle({ date: '', questions: level, level: level as HeatmapDay['level'], weekday: 0 })}
          />
        ))}
        <span className="text-[9px] font-bold" style={{ color: theme.text3 }}>mai mult</span>
      </div>
    </div>
  );
}
