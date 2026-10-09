import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTutorialStore } from '../store/tutorialStore';
import { TOURS, type SpotlightTourId } from './registry';
import { TOUR_META } from './tourMeta';

/** Wait a beat after arriving on a page, so the tour does not open over a page that is still animating in. */
const AUTOSTART_DELAY_MS = 900;

/**
 * Opens a page's short tour the first time the user visits that page after an update.
 *
 * It stays out of the way: not while another tour or full-screen overlay is up, not for a profile that
 * has not finished the onboarding yet (that tour covers the same ground), and not before the
 * "what's new" slides were dismissed, so the two never fight for the screen.
 */
export function useTourAutostart(profileId: string): void {
  const { pathname } = useLocation();
  const hydrated = useTutorialStore((state) => state._hasHydrated);
  const seen = useTutorialStore((state) => state.seen);
  const busy = useTutorialStore((state) => state.active);

  useEffect(() => {
    if (!hydrated || busy) return undefined;
    const store = useTutorialStore.getState();
    if (!store.hasSeen(profileId, 'onboarding') || !store.hasSeen(profileId, 'whatsNew')) return undefined;

    const due = (Object.keys(TOURS) as SpotlightTourId[]).find((id) => (
      TOURS[id].autoStartRoute === pathname
      && TOUR_META[id].repeatOnNewVersion
      && !store.hasSeen(profileId, id)
    ));
    if (!due) return undefined;

    const timer = window.setTimeout(() => {
      const now = useTutorialStore.getState();
      if (now.active || document.documentElement.dataset.overlay === 'open') return;
      now.startTour(due);
    }, AUTOSTART_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [busy, hydrated, pathname, profileId, seen]);
}
