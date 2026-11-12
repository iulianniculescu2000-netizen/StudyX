import type { ReactElement } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { clampChartData, getChartDetailSettings } from '../../lib/chartSimplifier';
import type { Theme } from '../../theme/themes';
import { accuracySummary, clamp, finite } from './chartMath';

interface ChartPoint {
  day: string;
  sesiuni: number;
  acuratete: number;
}

export default function AccuracyTrendChart({ data, theme, tooltip }: { data: ChartPoint[]; theme: Theme; tooltip: ReactElement }) {
  const { performanceLite, calmMotion } = useAdaptiveMotion();
  const detail = getChartDetailSettings(performanceLite);
  const chartData = clampChartData(data, performanceLite ? 8 : 14).map((d) => ({ ...d, acuratete: clamp(finite(d.acuratete), 0, 100) }));

  if (chartData.length === 0) {
    return <p className="text-[13px]" style={{ color: theme.text3 }}>Apare după prima sesiune cu răspunsuri.</p>;
  }

  return (
    <div role="img" aria-label={accuracySummary(chartData)}>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }} accessibilityLayer={false}>
          {detail.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />}
          <XAxis dataKey="day" tick={{ fill: theme.text3, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: theme.text3, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={tooltip} />
          <Line
            type="monotone"
            dataKey="acuratete"
            stroke={theme.success}
            strokeWidth={detail.strokeWidth}
            dot={{ fill: theme.success, r: Math.max(3, detail.dotRadius) }}
            isAnimationActive={detail.isAnimationActive && !calmMotion}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
