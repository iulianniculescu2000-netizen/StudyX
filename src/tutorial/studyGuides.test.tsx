import { describe, expect, it } from 'vitest';
import { readTourContext } from './useTourContext';
import { reviewTour } from './tours/review';
import { dailyTour } from './tours/daily';
import type { TourStep } from './types';

const empty = { ...readTourContext('/'), quizCount: 0, dueQuizCount: 0 };
const populated = { ...empty, quizCount: 5, dueQuizCount: 12 };
const body = (step: TourStep, context = empty) => typeof step.body === 'function' ? step.body(context) : step.body;

describe('manual study guides', () => {
  it('explains how an empty profile reaches daily repetition before offering a session', () => {
    expect(body(dailyTour.steps[0])).toContain('Adaugă o grilă');
    expect(body(dailyTour.steps[0], populated)).toContain('programate pentru repetare');
    expect(body(reviewTour.steps[0])).toContain('a răspunde la întrebări');
    expect(body(reviewTour.steps[0], populated)).toContain('sesiunea începe când alegi tu');
  });

  it('explains disabled due-question actions without asking the user to start them', () => {
    const due = reviewTour.steps.find((step) => step.id === 'review-due')!;
    expect(body(due)).toContain('dezactivată');
    expect(body(due, populated)).toContain('programat pentru repetare');
    expect(body(dailyTour.steps.find((step) => step.id === 'daily-start')!)).toContain('Ghidul nu apasă butonul');
  });

  it('never starts on entry or requires answering a real question to finish the guide', () => {
    for (const tour of [reviewTour, dailyTour]) {
      expect(tour.autoStartRoute).toBeUndefined();
      for (const step of tour.steps) {
        expect(step.completeWhen).toBeUndefined();
        expect(step.Extra).toBeUndefined();
        expect(step.route).toBe(tour.id === 'review' ? '/review' : '/daily-review');
      }
    }
  });

  it('allows missing ready-screen controls to be skipped without losing the daily explanation', () => {
    expect(dailyTour.steps.filter((step) => step.target).every((step) => step.optional)).toBe(true);
    expect(dailyTour.steps.filter((step) => !step.target)).toHaveLength(2);
  });
});
