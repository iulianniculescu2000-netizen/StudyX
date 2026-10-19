import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { ease } from '../../theme/motion';
import { parseDay, type AccuracyPoint, type HeatCell, type HourBar, type ProgressSeries } from '../../lib/organizare/engine';
import { shortDay } from '../../lib/organizare/format';
import { number } from './helpers';

/**
 * The width the chart is drawn at: the box it sits in, measured. Drawing at the real width (instead of a fixed
 * viewBox scaled to fit) keeps the 10px labels 10px in a half-width card and on a phone.
 */
function useChartWidth(): [(el: HTMLDivElement | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(640);
  const box = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(Math.max(240, w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [box, width];
}

function useChartInk() {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  return { theme, calm: calmMotion, grid: 'var(--hairline)', faint: theme.text3 };
}

/** Hours studied per day over the last weeks, against each day's target. */
export function HoursChart({ data }: { data: HourBar[] }) {
  const { theme, calm, grid, faint } = useChartInk();
  const [box, W] = useChartWidth();
  const H = 190;
  const l = 30; const r = 6; const t = 10; const b = 24;
  const n = data.length;
  const bw = (W - l - r) / n;
  const max = Math.max(6, Math.ceil(Math.max(...data.map((d) => d.hours)) / 2) * 2);
  const y = (v: number) => t + (H - t - b) * (1 - v / max);

  return (
    <div ref={box}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ore studiate pe zi, ultimele 28 de zile" className="h-auto w-full">
      {Array.from({ length: max / 2 + 1 }, (_, k) => k * 2).map((v) => (
        <g key={v}>
          <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={grid} strokeWidth={1} />
          <text x={l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={faint}>{v}</text>
        </g>
      ))}
      {data.map((d, k) => {
        const x = l + k * bw + bw * 0.18;
        const w = bw * 0.64;
        return (
          <g key={d.day}>
            {d.target > 0 && <rect x={x} y={y(d.target)} width={w} height={y(0) - y(d.target)} rx={3} fill="var(--fill-subtle)" />}
            {d.hours > 0 && (
              <motion.rect
                x={x}
                y={y(d.hours)}
                width={w}
                height={Math.max(2, y(0) - y(d.hours))}
                rx={3}
                fill={theme.accent}
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                initial={calm ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.15 + k * 0.012, duration: 0.55, ease: ease.emphasized }}
              >
                <title>{shortDay(d.day)}: {number(d.hours, 1)} h</title>
              </motion.rect>
            )}
            {(k % 7 === 0 || k === n - 1) && <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={faint}>{shortDay(d.day)}</text>}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** Pages finished in the running pass against what the plan expected by now. */
export function ProgressChart({ data, today }: { data: ProgressSeries; today: string }) {
  const { theme, calm, grid, faint } = useChartInk();
  const [box, W] = useChartWidth();
  const H = 200;
  const l = 34; const r = 10; const t = 12; const b = 24;
  const t0 = parseDay(data.from).getTime();
  const t1 = parseDay(data.to).getTime();
  const x = (day: string) => l + (W - l - r) * Math.max(0, Math.min(1, (parseDay(day).getTime() - t0) / (t1 - t0 || 1)));
  const y = (v: number) => t + (H - t - b) * (1 - v);
  const line = (pts: Array<[string, number]>) => pts.map(([d, v], k) => `${k ? 'L' : 'M'}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const steps = (pts: Array<[string, number]>) => pts.reduce((acc, [d, v], k) => (
    k === 0 ? `M${x(d).toFixed(1)} ${y(v).toFixed(1)}` : `${acc} L${x(d).toFixed(1)} ${y(pts[k - 1][1]).toFixed(1)} L${x(d).toFixed(1)} ${y(v).toFixed(1)}`
  ), '');
  const hasActual = data.actual.length > 1;
  const lastActual = data.actual[data.actual.length - 1];

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Progresul față de plan" className="h-auto w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={grid} strokeWidth={1} />
            <text x={l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={faint}>{Math.round(v * 100)}%</text>
          </g>
        ))}
        <text x={l} y={H - 6} fontSize={10} fill={faint}>{shortDay(data.from)}</text>
        <text x={W - r} y={H - 6} textAnchor="end" fontSize={10} fill={faint}>{shortDay(data.to)}</text>
        <path d={line(data.plan)} fill="none" stroke={faint} strokeWidth={1.6} strokeDasharray="5 5" />
        {hasActual && (
          <>
            <motion.path
              d={`${steps(data.actual)} L${x(lastActual[0]).toFixed(1)} ${y(0)} L${x(data.from).toFixed(1)} ${y(0)}Z`}
              fill={theme.accent}
              initial={calm ? false : { opacity: 0 }}
              animate={{ opacity: 0.14 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            />
            <motion.path
              d={steps(data.actual)}
              fill="none"
              stroke={theme.accent}
              strokeWidth={2.4}
              strokeLinejoin="round"
              initial={calm ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: ease.emphasized }}
            />
          </>
        )}
        {today >= data.from && today <= data.to && (
          <line x1={x(today)} x2={x(today)} y1={t} y2={y(0)} stroke={theme.text} strokeWidth={1.2} strokeDasharray="2 3" opacity={0.5} />
        )}
      </svg>
      <div className="mt-2 flex gap-5 text-[12px]" style={{ color: faint }}>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: faint }} />Planul</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded" style={{ background: theme.accent }} />Ce ai terminat tu</span>
      </div>
      {!hasActual && <p className="mt-2 text-[12.5px]" style={{ color: faint }}>Linia ta apare după ce marchezi primul topic „Gata”.</p>}
    </div>
  );
}

/** Share of quizzes answered correctly, week by week. */
export function AccuracyChart({ data }: { data: AccuracyPoint[] }) {
  const { theme, calm, grid, faint } = useChartInk();
  const [box, W] = useChartWidth();
  const H = 190;
  const l = 34; const r = 10; const t = 14; const b = 24;
  const x = (k: number) => l + (W - l - r) * ((k + 0.5) / data.length);
  const y = (v: number) => t + (H - t - b) * (1 - v);
  const points = data.map((p, k) => [k, p] as const).filter(([, p]) => p.p !== null);
  const path = points.map(([k, p], i) => `${i ? 'L' : 'M'}${x(k).toFixed(1)} ${y(p.p as number).toFixed(1)}`).join(' ');

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Acuratețea grilelor pe săptămână" className="h-auto w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={grid} strokeWidth={1} />
            <text x={l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={faint}>{Math.round(v * 100)}%</text>
          </g>
        ))}
        {points.length > 1 && (
          <motion.path d={path} fill="none" stroke={theme.accent} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round"
            initial={calm ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: ease.emphasized }} />
        )}
        {points.map(([k, p], i) => (
          <g key={p.week}>
            <motion.circle cx={x(k)} cy={y(p.p as number)} r={4.5} fill={theme.accent} stroke="var(--bg)" strokeWidth={2}
              initial={calm ? false : { scale: 0 }} animate={{ scale: 1 }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              transition={{ delay: 0.3 + i * 0.07, type: 'spring', stiffness: 420, damping: 18 }}>
              <title>{shortDay(p.week)}: {Math.round((p.p as number) * 100)}% din {p.g} grile</title>
            </motion.circle>
            <text x={x(k)} y={y(p.p as number) - 10} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={theme.text2}>{Math.round((p.p as number) * 100)}%</text>
          </g>
        ))}
        {data.map((p, k) => (k % 3 === 0 || k === data.length - 1) && (
          <text key={p.week} x={x(k)} y={H - 6} textAnchor="middle" fontSize={10} fill={faint}>{shortDay(p.week)}</text>
        ))}
      </svg>
      {points.length === 0 && <p className="mt-2 text-[12.5px]" style={{ color: faint }}>Apare după ce înregistrezi grile rezolvate și corecte.</p>}
    </div>
  );
}

/** A calendar of the last weeks: the darker a day, the closer it came to its target. */
export function Heatmap({ grid: cells }: { grid: Array<Array<HeatCell | null>> }) {
  const { theme, calm, faint } = useChartInk();
  const [box, W] = useChartWidth();
  const weeks = cells.length;
  // Cells grow with the card up to a calm size; past that the calendar keeps its size instead of turning into tiles.
  const cs = Math.min(30, (W - 30) / weeks);
  const H = 7 * cs + 4;
  return (
    <div ref={box}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calendar de studiu, ultimele 14 săptămâni" className="h-auto w-full">
      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, k) => (
        <text key={k} x={10} y={k * cs + cs * 0.62} textAnchor="middle" fontSize={10} fill={faint}>{d}</text>
      ))}
      {cells.map((week, w) => week.map((cell, k) => cell && (
        <motion.rect
          key={cell.day}
          x={24 + w * cs + 1.5}
          y={k * cs + 1.5}
          width={cs - 3}
          height={cs - 3}
          rx={4}
          fill={cell.level ? theme.accent : 'var(--fill-subtle)'}
          fillOpacity={cell.level ? 0.25 + 0.75 * cell.level : 1}
          initial={calm ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          transition={{ delay: 0.1 + (w * 7 + k) * 0.006, duration: 0.35 }}
        >
          <title>{shortDay(cell.day)}: {cell.hours ? `${number(cell.hours, 1)} h` : 'fără înregistrare'}</title>
        </motion.rect>
      )))}
    </svg>
    </div>
  );
}
