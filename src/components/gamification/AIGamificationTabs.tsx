import SegmentedTabs from '../fx/SegmentedTabs';
import { TAB_ITEMS, type GamificationTab } from './gamificationCatalog';

interface AIGamificationTabsProps {
  activeTab: GamificationTab;
  setActiveTab: (tab: GamificationTab) => void;
}

/** Cele trei secțiuni ale paginii; navigarea cu săgeți, Home/End și ARIA vin din `SegmentedTabs`. */
export default function AIGamificationTabs({ activeTab, setActiveTab }: AIGamificationTabsProps) {
  return (
    <SegmentedTabs
      tabs={TAB_ITEMS}
      value={activeTab}
      onChange={setActiveTab}
      layoutId="gamification-tab-pill"
      ariaLabel="Secțiuni Realizări"
      idPrefix="gamification"
    />
  );
}
