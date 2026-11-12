import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { clampChartData, getChartDetailSettings } from '../../lib/chartSimplifier';
import type { Theme } from '../../theme/themes';
import { clamp, finite, radarSummary, truncateLabel } from './chartMath';

interface RadarPoint {
  subject: string;
  acuratete: number;
  fullMark: number;
}

export default function CategoryRadarChart({ data, theme }: { data: RadarPoint[]; theme: Theme }) {
  const { performanceLite, calmMotion } = useAdaptiveMotion();
  const detail = getChartDetailSettings(performanceLite);
  const chartData = clampChartData(data, performanceLite ? 6 : 10).map((d) => ({ ...d, acuratete: clamp(finite(d.acuratete), 0, 100), fullMark: 100 }));

  if (chartData.length === 0) {
    return <p className="text-[13px]" style={{ color: theme.text3 }}>Apare după ce rezolvi grile din cel puțin trei categorii.</p>;
  }

  return (
    <div role="img" aria-label={radarSummary(chartData)}>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={chartData} outerRadius="68%" accessibilityLayer={false}>
          {detail.showGrid && <PolarGrid stroke="var(--hairline)" />}
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: theme.text3, fontSize: 11 }}
            tickFormatter={(value: string) => truncateLabel(value, 12)}
          />
          {/* Scale fixed to 0-100: without it the radar stretches to the best category and 40% looks like a full score. */}
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="acuratete"
            stroke={theme.accent2}
            fill={theme.accent2}
            fillOpacity={detail.radarOpacity}
            isAnimationActive={detail.isAnimationActive && !calmMotion}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
