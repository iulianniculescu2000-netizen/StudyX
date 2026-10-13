import { describe, expect, it } from 'vitest';
import { readTourContext } from './useTourContext';
import { analyticsTour } from './tours/analytics';
import { gamificationTour } from './tours/gamification';
import { crunchTour } from './tours/crunch';
import type { TourStep } from './types';

const empty = { ...readTourContext('/'), quizCount: 0, deckCount: 0, aiReady: false };
const populated = { ...empty, quizCount: 3, aiReady: true };
const body = (step: TourStep, ctx = empty) => typeof step.body === 'function' ? step.body(ctx) : step.body;

describe('progress and exam preparation guides', () => {
  it('explains local calculations without promising an exam result', () => {
    expect(body(analyticsTour.steps[0], populated)).toContain('nu este scorul oficial');
    expect(body(analyticsTour.steps[0])).toContain('fără istoric suficient');
    expect(body(gamificationTour.steps[0])).toContain('nu generează premii prin AI');
  });

  it('describes unseen questions in the recovery pool and an explicit session start', () => {
    const pool = crunchTour.steps.find((step) => step.id === 'crunch-pool')!;
    expect(body(pool)).toContain('încă nevăzute');
    expect(body(pool, populated)).toContain('încă nu le-ai văzut');
    expect(body(crunchTour.steps.find((step) => step.id === 'crunch-duration')!)).toContain('creează și pornește sesiunea');
  });

  it('keeps tours manual and never requires a data-changing action to complete', () => {
    for (const tour of [analyticsTour, gamificationTour, crunchTour]) {
      expect(tour.autoStartRoute).toBeUndefined();
      for (const step of tour.steps) {
        expect(step.completeWhen).toBeUndefined();
        expect(step.Extra).toBeUndefined();
      }
    }
  });
});
