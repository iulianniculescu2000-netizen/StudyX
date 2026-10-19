import { createContext, useContext } from 'react';
import type { Plan, PlanState, Status, Topic } from '../../lib/organizare/types';
import type { Windows } from '../../lib/organizare/engine';

export interface OrganizareApi {
  plan: Plan;
  state: PlanState;
  /** Planned dates, with the student's weekly picks applied. */
  win: Windows;
  /** Today, YYYY-MM-DD. */
  today: string;
  profileId: string;
  /** Applies a change to the student's progress and saves it. */
  update: (change: (s: PlanState) => PlanState) => void;
  /** Sets a topic's status; `origin` (screen position of the tap) is where the celebration starts. */
  setStatus: (ph: number, i: number, v: Status, origin?: { x: number; y: number }) => void;
  /** Moves the page to another tab; with `topic` (Topic.index) the Topicuri tab opens that topic and scrolls to it. */
  goTo: (tab: string, pass?: number, topic?: number) => void;
  /** The Rezidențiat page with the quizzes of a topic's specialty, or null when that bank is not in the app. */
  grileHref: (topic: Topic) => string | null;
}

export const OrganizareContext = createContext<OrganizareApi | null>(null);

export function useOrganizare(): OrganizareApi {
  const api = useContext(OrganizareContext);
  if (!api) throw new Error('useOrganizare must be used inside the Organizare page');
  return api;
}
