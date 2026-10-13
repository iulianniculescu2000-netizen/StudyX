import { describe, expect, it } from 'vitest';
import { readTourContext } from './useTourContext';
import { notesTour } from './tours/notes';
import { statsTour } from './tours/stats';
import type { TourStep } from './types';

const empty = { ...readTourContext('/'), quizCount: 0, aiReady: false };
const populated = { ...empty, quizCount: 3, aiReady: true };
const body = (step: TourStep, ctx = empty) => typeof step.body === 'function' ? step.body(ctx) : step.body;

describe('notes and statistics guides', () => {
  it('distinguishes having quizzes from having notes or study sessions', () => {
    expect(body(notesTour.steps[0])).toContain('Adaugă o grilă');
    expect(body(notesTour.steps[0], populated)).toContain('Dacă lista este goală');
    expect(body(statsTour.steps[0])).toContain('nu ai sesiuni înregistrate');
    expect(body(statsTour.steps[0], populated)).toContain('simpla existență a unei grile');
  });

  it('explains AI requirements and keeps provider requests a user action', () => {
    const notesAI = notesTour.steps.find((step) => step.id === 'notes-ai')!;
    const statsAI = statsTour.steps.find((step) => step.id === 'stats-ai')!;
    expect(body(notesAI)).toContain('fără AI');
    expect(body(notesAI, populated)).toContain('lista filtrată');
    expect(body(statsAI)).toContain('fără AI');
    expect(body(statsAI, populated)).toContain('când apeși Analizează');
  });

  it('keeps guides manual and permits unavailable content sections to be skipped', () => {
    for (const tour of [notesTour, statsTour]) {
      expect(tour.autoStartRoute).toBeUndefined();
      for (const step of tour.steps) {
        expect(step.completeWhen).toBeUndefined();
        expect(step.Extra).toBeUndefined();
        expect(step.route).toBe(tour.id === 'notes' ? '/notes' : '/stats');
      }
    }
    expect(notesTour.steps.filter((step) => step.target).every((step) => step.optional)).toBe(true);
    expect(statsTour.steps.find((step) => step.id === 'stats-activity')?.optional).toBe(true);
  });
});
