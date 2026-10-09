import { chatTour } from './tours/chat';
import { createTour } from './tours/create';
import { dashboardTour } from './tours/dashboard';
import { errorsTour } from './tours/errors';
import { flashcardsTour } from './tours/flashcards';
import { onboardingTour } from './tours/onboarding';
import { organizareTour } from './tours/organizare';
import { quizzesTour } from './tours/quizzes';
import { residencyFlashcardsTour } from './tours/residencyFlashcards';
import { residencyTour } from './tours/residency';
import { settingsTour } from './tours/settings';
import { simulationTour } from './tours/simulation';
import { vaultTour } from './tours/vault';
import type { TourId } from './tourMeta';
import type { TourDefinition } from './types';

/** The tours that run as a spotlight, one step at a time. "What's new" is a slide show with its own component. */
export type SpotlightTourId = Exclude<TourId, 'whatsNew' | 'welcomeFilm'>;

export const TOURS: Record<SpotlightTourId, TourDefinition> = {
  onboarding: onboardingTour,
  dashboard: dashboardTour,
  quizzes: quizzesTour,
  create: createTour,
  settings: settingsTour,
  residency: residencyTour,
  flashcards: flashcardsTour,
  vault: vaultTour,
  simulation: simulationTour,
  errors: errorsTour,
  organizare: organizareTour,
  residencyFlashcards: residencyFlashcardsTour,
  chat: chatTour,
};

export const isSpotlightTour = (id: TourId): id is SpotlightTourId => id in TOURS;
