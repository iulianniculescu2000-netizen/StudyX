import type { ReactElement } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { clampChartData, getChartDetailSettings } from '../../lib/chartSimplifier';
import type { Theme } from '../../theme/themes';

interface ChartPoint {
  day: string;
  sesiuni: number;
  acuratete: number;
}

export default function AccuracyTrendChart({ data, theme, tooltip }: { data: ChartPoint[]; theme: Theme; tooltip: ReactElement }) {
  const { performanceLite, calmMotion } = useAdaptiveMotion();
  const detail = getChartDetailSettings(performanceLite);
  const chartData = clampChartData(data, performanceLite ? 8 : 14);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
        {detail.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />}
        <XAxis dataKey="day" tick={{ fill: theme.text3, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: theme.text3, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={tooltip} />
        <Line
          type="monotone"
          dataKey="acuratete"
          stroke={theme.success}
          strokeWidth={detail.strokeWidth}
          dot={{ fill: theme.success, r: detail.dotRadius }}
          isAnimationActive={detail.isAnimationActive && !calmMotion}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
