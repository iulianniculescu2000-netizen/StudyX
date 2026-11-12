import type { ReactElement } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { clampChartData, getChartDetailSettings } from '../../lib/chartSimplifier';
import type { Theme } from '../../theme/themes';
import { activitySummary, finite, niceScale } from './chartMath';

interface ChartPoint {
  day: string;
  sesiuni: number;
  acuratete: number;
}

export default function ActivityBarChart({ data, theme, tooltip }: { data: ChartPoint[]; theme: Theme; tooltip: ReactElement }) {
  const { performanceLite, calmMotion } = useAdaptiveMotion();
  const detail = getChartDetailSettings(performanceLite);
  const chartData = clampChartData(data, performanceLite ? 8 : 14).map((d) => ({ ...d, sesiuni: Math.max(0, finite(d.sesiuni)) }));
  const { max, step } = niceScale(Math.max(0, ...chartData.map((d) => d.sesiuni)), 4);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, k) => k * step);

  return (
    <div role="img" aria-label={activitySummary(chartData)}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }} accessibilityLayer={false}>
          <XAxis dataKey="day" tick={{ fill: theme.text3, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
          <YAxis domain={[0, max]} ticks={ticks} allowDecimals={false} tick={{ fill: theme.text3, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={tooltip} />
          <Bar
            dataKey="sesiuni"
            fill={theme.accent}
            radius={detail.barRadius as [number, number, number, number]}
            isAnimationActive={detail.isAnimationActive && !calmMotion}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
