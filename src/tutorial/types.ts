import type { ComponentType, ReactNode } from 'react';
import type { TourId } from './tourMeta';

/** What a step may depend on, read from the app's own stores. */
export interface TourContext {
  /** Providers with a saved key (the active one included). */
  aiProviders: string[];
  aiKeyCount: number;
  /** Grile (not flashcard decks) in the profile. */
  quizCount: number;
  deckCount: number;
  /** Documents in the AI library. */
  sourceCount: number;
  pathname: string;
}

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  id: string;
  title: string;
  /** Plain text; a function lets a step adapt to the user (for example to how many AI keys they have). */
  body: string | ((ctx: TourContext) => string);
  icon: ReactNode;
  /** CSS selector of the element to light up; without one (or without a match) the card is centered. */
  target?: string;
  targetPadding?: number;
  placement?: TourPlacement;
  /** Page to open before the step is shown. */
  route?: string;
  accent?: string;
  /** The step is left out for users it does not apply to. Evaluated once, when the tour starts. */
  when?: (ctx: TourContext) => boolean;
  /**
   * Makes this a "do it yourself" step: it completes (and the tour moves on) when this returns true.
   * `atEntry` is the context as the step was shown, so a count can be compared to where it started.
   * "Sari peste" is always there; nothing blocks.
   */
  completeWhen?: (ctx: TourContext, atEntry: TourContext) => boolean;
  /**
   * The step is skipped when its target is not on the page a moment after the step opens (a menu that only
   * exists in some states, a setting another build does not have). Without it a missing target shows a centered card.
   */
  optional?: boolean;
  /** Short line under the text of a "do it yourself" step. */
  actionHint?: string;
  /** Extra content under the text (for example the AI key form). `advance` moves to the next step. */
  Extra?: ComponentType<{ ctx: TourContext; advance: () => void }>;
}

export interface TourDefinition {
  id: TourId;
  /** Shown to screen readers and in the card header. */
  title: string;
  steps: TourStep[];
  /** Mini-tours open on the first visit to this page after an update. */
  autoStartRoute?: string;
}
