import { useTheme } from '../../theme/ThemeContext';
import type { PeriodDays } from '../../lib/analyticsStats';
import PageHeader from '../ui/PageHeader';
import AIPredictiveTimeframe from './AIPredictiveTimeframe';

interface AIPredictiveHeaderProps {
  currentLevel: number;
  period: PeriodDays;
  onPeriodChange: (days: PeriodDays) => void;
}

export default function AIPredictiveHeader({ currentLevel, period, onPeriodChange }: AIPredictiveHeaderProps) {
  const theme = useTheme();
  return (
    <PageHeader
      title="Perspective AI"
      help="page-analytics"
      subtitle="Calculat din răspunsurile tale; AI-ul intervine doar când îl întrebi."
      actions={(
        <>
          <span className="fine-chip rounded-full px-3 py-1.5 text-[12.5px] font-semibold" style={{ color: theme.accentText }}>
            Nivel {currentLevel}
          </span>
          <AIPredictiveTimeframe value={period} onChange={onPeriodChange} />
        </>
      )}
    />
  );
}
