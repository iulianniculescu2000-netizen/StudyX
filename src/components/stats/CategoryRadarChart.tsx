import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { clampChartData, getChartDetailSettings } from '../../lib/chartSimplifier';
import type { Theme } from '../../theme/themes';

interface RadarPoint {
  subject: string;
  acuratete: number;
  fullMark: number;
}

export default function CategoryRadarChart({ data, theme }: { data: RadarPoint[]; theme: Theme }) {
  const { performanceLite, calmMotion } = useAdaptiveMotion();
  const detail = getChartDetailSettings(performanceLite);
  const chartData = clampChartData(data, performanceLite ? 6 : 10);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={chartData}>
        {detail.showGrid && <PolarGrid stroke="var(--hairline)" />}
        <PolarAngleAxis dataKey="subject" tick={{ fill: theme.text3, fontSize: 11 }} />
        <Radar
          dataKey="acuratete"
          stroke={theme.accent2}
          fill={theme.accent2}
          fillOpacity={detail.radarOpacity}
          isAnimationActive={detail.isAnimationActive && !calmMotion}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
