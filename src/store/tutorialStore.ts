import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LEGACY_ONBOARDING_VERSION, TOUR_IDS, TOUR_META, isTourVersionCurrent, type TourId } from '../tutorial/tourMeta';

/** profile id → tour id → version of the tour the profile has seen. */
export type SeenTours = Record<string, Partial<Record<TourId, string>>>;

interface TutorialStore {
  /** Which tour is on screen, if any. Never persisted: a restart must not reopen a tour mid-way. */
  activeTour: TourId | null;
  /** Kept as a plain flag for the many places that only ask "is a tour running?". */
  active: boolean;
  currentStep: number;
  seen: SeenTours;
  _hasHydrated: boolean;

  startTour: (tourId: TourId, step?: number) => void;
  /** The first-run tour; kept under its old name for the callers that predate several tours. */
  startTutorial: () => void;
  /** `total` is the number of steps in the tour being shown; the tour owns that count, not the store. */
  nextStep: (total: number) => void;
  prevStep: () => void;
  /** Closes the running tour for this profile and records it as seen, whether it ended or was skipped. */
  finishTour: (profileId: string) => void;
  markSeen: (profileId: string, tourId: TourId) => void;
  /** After the onboarding every tour counts as seen: a new user is not shown 2.3.0's "what's new". */
  markAllSeen: (profileId: string) => void;
  skipTutorial: (profileId: string) => void;
  completeTutorial: (profileId: string) => void;
  resetTutorial: () => void;
  hasSeen: (profileId: string, tourId: TourId) => boolean;
  isCompleted: (profileId: string) => boolean;
}

interface PersistedTutorial {
  seen?: SeenTours;
  /** Written by versions up to 2.2: profiles that finished the one tour. */
  completedProfiles?: string[];
}

/** Carries the old "completed" list over: those profiles skip the onboarding but still get 2.3.0's news. */
export function migrateTutorialState(persisted: unknown): { seen: SeenTours } {
  const old = (persisted ?? {}) as PersistedTutorial;
  const seen: SeenTours = { ...(old.seen ?? {}) };
  for (const profileId of old.completedProfiles ?? []) {
    seen[profileId] = { onboarding: LEGACY_ONBOARDING_VERSION, ...(seen[profileId] ?? {}) };
  }
  return { seen };
}

const withSeen = (seen: SeenTours, profileId: string, tourId: TourId): SeenTours => (
  seen[profileId]?.[tourId] === TOUR_META[tourId].version
    ? seen
    : { ...seen, [profileId]: { ...(seen[profileId] ?? {}), [tourId]: TOUR_META[tourId].version } }
);

export const useTutorialStore = create<TutorialStore>()(
  persist(
    (set, get) => ({
      activeTour: null,
      active: false,
      currentStep: 0,
      seen: {},
      _hasHydrated: false,

      startTour: (tourId, step = 0) => set({ activeTour: tourId, active: true, currentStep: step }),
      startTutorial: () => get().startTour('onboarding'),

      nextStep: (total) => {
        const next = get().currentStep + 1;
        if (next >= total) set({ activeTour: null, active: false, currentStep: 0 });
        else set({ currentStep: next });
      },

      prevStep: () => set((s) => ({ currentStep: Math.max(0, s.currentStep - 1) })),

      finishTour: (profileId) => set((s) => ({
        seen: s.activeTour === 'onboarding'
          // The onboarding already covered the pages the short tours explain, and a new user has no "what's new".
          ? TOUR_IDS.reduce((acc, tourId) => withSeen(acc, profileId, tourId), s.seen)
          : s.activeTour ? withSeen(s.seen, profileId, s.activeTour) : s.seen,
        activeTour: null,
        active: false,
        currentStep: 0,
      })),

      markSeen: (profileId, tourId) => set((s) => ({ seen: withSeen(s.seen, profileId, tourId) })),

      markAllSeen: (profileId) => set((s) => ({
        seen: TOUR_IDS.reduce((acc, tourId) => withSeen(acc, profileId, tourId), s.seen),
      })),

      skipTutorial: (profileId) => get().finishTour(profileId),
      completeTutorial: (profileId) => get().finishTour(profileId),

      resetTutorial: () => set({ activeTour: null, active: false, currentStep: 0 }),

      hasSeen: (profileId, tourId) => isTourVersionCurrent(tourId, get().seen[profileId]?.[tourId]),
      isCompleted: (profileId) => get().hasSeen(profileId, 'onboarding'),
    }),
    {
      name: 'studyx-tutorial-v2',
      version: 3,
      // Only what the user has seen survives a restart; a tour that was open (and its step) does not.
      partialize: (state) => ({ seen: state.seen }),
      migrate: (persisted) => migrateTutorialState(persisted),
    }
  )
);

// localStorage hydrates synchronously while the store above is still being created, so a callback inside
// the persist options would run before `useTutorialStore` exists. Ask once the store is there instead.
if (useTutorialStore.persist.hasHydrated()) useTutorialStore.setState({ _hasHydrated: true });
else useTutorialStore.persist.onFinishHydration(() => useTutorialStore.setState({ _hasHydrated: true }));
