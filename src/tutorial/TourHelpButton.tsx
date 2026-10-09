import { HelpCircle } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useTutorialStore } from '../store/tutorialStore';
import type { TourId } from './tourMeta';

/** The "?" next to a page title: replays that page's short tour whenever the user wants it. */
export default function TourHelpButton({ tour, label }: { tour: TourId; label: string }) {
  const theme = useTheme();
  return (
    <button
      type="button"
      onClick={() => useTutorialStore.getState().startTour(tour)}
      aria-label={label}
      title="Tur rapid"
      className="fine-row press-feedback flex h-7 w-7 items-center justify-center rounded-full"
      style={{ color: theme.text3 }}
    >
      <HelpCircle size={16} />
    </button>
  );
}
