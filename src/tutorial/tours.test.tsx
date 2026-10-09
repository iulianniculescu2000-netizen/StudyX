import { beforeEach, describe, expect, it } from 'vitest';
import { migrateTutorialState, useTutorialStore } from '../store/tutorialStore';
import { CURRENT_TOUR_VERSION, GUIDE_LIST, LEGACY_ONBOARDING_VERSION, RELEASE_DISPLAY_NAME, TOUR_IDS, TOUR_META } from './tourMeta';
import { TOURS, type SpotlightTourId } from './registry';
import { keyGuideIntro } from './keyGuideText';
import { savedProviders } from './useTourContext';
import type { TourContext } from './types';

const emptyContext: TourContext = { aiProviders: [], aiKeyCount: 0, quizCount: 0, deckCount: 0, sourceCount: 0, pathname: '/' };
const spotlightIds = Object.keys(TOURS) as SpotlightTourId[];

describe('tour registry', () => {
  it('gives every spotlight tour at least two steps and unique step ids', () => {
    for (const id of spotlightIds) {
      const steps = TOURS[id].steps;
      expect(steps.length, id).toBeGreaterThanOrEqual(2);
      expect(new Set(steps.map((step) => step.id)).size, id).toBe(steps.length);
    }
  });

  it('keeps tour ids in step with the metadata', () => {
    for (const id of spotlightIds) expect(TOURS[id].id).toBe(id);
    expect(TOUR_IDS).toContain('whatsNew');
  });

  it('survives every adaptive hook on an empty profile', () => {
    for (const id of spotlightIds) {
      for (const step of TOURS[id].steps) {
        expect(() => step.when?.(emptyContext)).not.toThrow();
        expect(() => step.completeWhen?.(emptyContext, emptyContext)).not.toThrow();
        const body = typeof step.body === 'function' ? step.body(emptyContext) : step.body;
        expect(body.length, step.id).toBeGreaterThan(10);
      }
    }
  });

  it('never quotes a provider limit in a tour text, since those change', () => {
    for (const id of spotlightIds) {
      for (const step of TOURS[id].steps) {
        const body = typeof step.body === 'function' ? step.body(emptyContext) : step.body;
        expect(`${step.title} ${body}`, step.id).not.toMatch(/tokeni|miliard|1\.000\.000/i);
      }
    }
  });

  it('gives each new page tour its own route, version and "?" target', () => {
    const expected = { simulation: '/simulare', errors: '/erori', organizare: '/rezidentiat/organizare' } as const;
    for (const [id, route] of Object.entries(expected) as Array<[keyof typeof expected, string]>) {
      expect(TOURS[id].autoStartRoute, id).toBe(route);
      expect(TOUR_META[id], id).toEqual({ version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true });
      expect(TOURS[id].steps.every((step) => !step.route || step.route === route), id).toBe(true);
    }
  });

  it('describes release 1.0: every tour carries the current version, the onboarding and the film never repeat', () => {
    expect(CURRENT_TOUR_VERSION).toBe('1.0.0');
    expect(RELEASE_DISPLAY_NAME).toBe('1.0');
    for (const id of TOUR_IDS) expect(TOUR_META[id].version, id).toBe(CURRENT_TOUR_VERSION);
    for (const id of ['onboarding', 'welcomeFilm'] as const) expect(TOUR_META[id].repeatOnNewVersion, id).toBe(false);
    for (const id of ['residency', 'residencyFlashcards', 'chat', 'simulation', 'errors', 'organizare', 'flashcards', 'vault'] as const) {
      expect(TOUR_META[id], id).toEqual({ version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true });
    }
  });

  it('lists every spotlight tour in the guides of Settings, each one once', () => {
    const listed = GUIDE_LIST.map((guide) => guide.id);
    expect(new Set(listed).size).toBe(listed.length);
    for (const id of spotlightIds) expect(listed, id).toContain(id);
    for (const guide of GUIDE_LIST) expect(guide.description.length, guide.id).toBeGreaterThan(10);
  });

  it('keeps the tours that have no page of their own manual: they never start by themselves', () => {
    for (const id of ['onboarding', 'dashboard', 'quizzes', 'create', 'settings', 'chat'] as const) expect(TOURS[id].autoStartRoute, id).toBeUndefined();
  });

  it('shows the 1.0 slides and the page tours once to a profile from an older build, but never the onboarding again', () => {
    useTutorialStore.setState({
      seen: { p1: { onboarding: '2.3.0', flashcards: '2.3.0', vault: '2.3.0', whatsNew: '2.3.2', residency: '2.3.2', simulation: '2.3.2', errors: '2.3.2', organizare: '2.3.2', chat: '2.3.2', residencyFlashcards: '2.3.2' } },
    });
    const { hasSeen } = useTutorialStore.getState();
    expect(hasSeen('p1', 'onboarding')).toBe(true);
    for (const id of ['whatsNew', 'flashcards', 'vault', 'residency', 'simulation', 'errors', 'organizare', 'chat', 'residencyFlashcards'] as const) expect(hasSeen('p1', id), id).toBe(false);
  });

  it('opens the Rezidențiat flashcards tour on its own page and keeps the chat tour manual', () => {
    expect(TOURS.residencyFlashcards.autoStartRoute).toBe('/rezidentiat/flashcarduri');
    expect(TOURS.residency.autoStartRoute).toBe('/rezidentiat');
    expect(TOURS.chat.autoStartRoute).toBeUndefined();
    for (const id of ['residency', 'residencyFlashcards', 'chat'] as const) {
      const steps = TOURS[id].steps;
      expect(steps.length, id).toBeGreaterThanOrEqual(3);
      expect(steps.length, id).toBeLessThanOrEqual(6);
    }
  });

  it('only points at anchors that exist in the UI, unless the step is optional', () => {
    const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const code = Object.entries(sources).filter(([path]) => !path.includes('/tutorial/') && !path.includes('.test.')).map(([, text]) => text).join(String.fromCharCode(10));
    const missing: string[] = [];
    for (const id of spotlightIds) {
      for (const step of TOURS[id].steps) {
        const match = step.target?.match(/data-tutorial="([^"]+)"/);
        if (!match || step.optional) continue;
        if (!code.includes(`data-tutorial="${match[1]}"`) && !code.includes(`'data-tutorial': '${match[1]}'`)) missing.push(`${id}/${step.id}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('marks a step optional whenever its target only exists in some states', () => {
    for (const id of ['residency', 'residencyFlashcards'] as const) {
      for (const step of TOURS[id].steps) {
        if (step.id === 'residency-folders' || step.id === 'rez-flash-folders') expect(step.optional, step.id).toBe(true);
      }
    }
  });

  it('asks the user to create a grilă and finishes when the count goes up', () => {
    const step = TOURS.onboarding.steps.find((entry) => entry.id === 'first-quiz');
    expect(step?.completeWhen?.(emptyContext, emptyContext)).toBe(false);
    expect(step?.completeWhen?.({ ...emptyContext, quizCount: 1 }, emptyContext)).toBe(true);
  });
});

describe('AI key guide text', () => {
  it('speaks differently for zero, one and several keys', () => {
    const none = keyGuideIntro(0, []);
    const one = keyGuideIntro(1, ['groq']);
    const many = keyGuideIntro(2, ['groq', 'google']);
    expect(new Set([none, one, many]).size).toBe(3);
    expect(one).toContain('Groq');
    expect(many).toContain('Google Gemini');
  });

  it('counts the active provider key and ignores blanks', () => {
    expect(savedProviders({ groq: 'gsk_x', google: '  ' }, 'groq', 'gsk_x')).toEqual(['groq']);
    expect(savedProviders({}, 'mistral', 'abc').sort()).toEqual(['mistral']);
    expect(savedProviders({ groq: 'a', google: 'b' }, 'groq', 'a').sort()).toEqual(['google', 'groq']);
  });
});

describe('tutorial store', () => {
  beforeEach(() => {
    useTutorialStore.setState({ activeTour: null, active: false, currentStep: 0, seen: {} });
  });

  it('carries the old completed profiles over without re-running the onboarding', () => {
    const migrated = migrateTutorialState({ completedProfiles: ['p1'], active: true, currentStep: 7 });
    expect(migrated.seen.p1?.onboarding).toBe(LEGACY_ONBOARDING_VERSION);
    useTutorialStore.setState({ seen: migrated.seen });
    expect(useTutorialStore.getState().isCompleted('p1')).toBe(true);
    expect(useTutorialStore.getState().isCompleted('p2')).toBe(false);
  });

  it('still shows what is new, and the page tours, to a profile migrated from 2.2', () => {
    useTutorialStore.setState({ seen: migrateTutorialState({ completedProfiles: ['p1'] }).seen });
    const { hasSeen } = useTutorialStore.getState();
    expect(hasSeen('p1', 'whatsNew')).toBe(false);
    expect(hasSeen('p1', 'residency')).toBe(false);
  });

  it('records a tour as seen when it is closed, and shows it again for a newer version', () => {
    const store = useTutorialStore.getState();
    store.startTour('residency');
    store.finishTour('p1');
    expect(useTutorialStore.getState().active).toBe(false);
    expect(useTutorialStore.getState().hasSeen('p1', 'residency')).toBe(true);

    useTutorialStore.setState({ seen: { p1: { residency: '2.2.0' } } });
    expect(useTutorialStore.getState().hasSeen('p1', 'residency')).toBe(false);
  });

  it('marks every tour seen once the onboarding ends, so a new user skips "what is new"', () => {
    const store = useTutorialStore.getState();
    store.startTutorial();
    store.finishTour('p1');
    for (const id of TOUR_IDS) expect(useTutorialStore.getState().hasSeen('p1', id), id).toBe(true);
    expect(useTutorialStore.getState().seen.p1?.whatsNew).toBe(TOUR_META.whatsNew.version);
  });

  it('keeps a profile that has not finished separate from one that has', () => {
    useTutorialStore.getState().markSeen('p1', 'onboarding');
    expect(useTutorialStore.getState().isCompleted('p2')).toBe(false);
  });

  it('shows "what is new" once to a profile that finished the onboarding, and nothing it already saw', () => {
    useTutorialStore.setState({
      seen: { p1: { onboarding: CURRENT_TOUR_VERSION, residency: CURRENT_TOUR_VERSION } },
    });
    const { hasSeen } = useTutorialStore.getState();
    expect(hasSeen('p1', 'onboarding')).toBe(true);
    expect(hasSeen('p1', 'residency')).toBe(true);
    for (const id of ['whatsNew', 'flashcards', 'vault', 'residencyFlashcards', 'chat', 'simulation', 'errors', 'organizare'] as const) expect(hasSeen('p1', id), id).toBe(false);

    const store = useTutorialStore.getState();
    store.markSeen('p1', 'whatsNew');
    expect(useTutorialStore.getState().hasSeen('p1', 'whatsNew')).toBe(true);
    expect(useTutorialStore.getState().seen.p1?.whatsNew).toBe(CURRENT_TOUR_VERSION);
  });

  it('keeps a profile from an older build through the persisted migration', () => {
    const migrated = migrateTutorialState({ seen: { p1: { onboarding: '2.3.0', whatsNew: '2.3.0' } } });
    useTutorialStore.setState({ seen: migrated.seen });
    expect(useTutorialStore.getState().hasSeen('p1', 'onboarding')).toBe(true);
    expect(useTutorialStore.getState().hasSeen('p1', 'whatsNew')).toBe(false);
  });

  it('closes after the last step and only moves forward within the tour length', () => {
    const store = useTutorialStore.getState();
    store.startTour('flashcards');
    store.nextStep(3);
    expect(useTutorialStore.getState().currentStep).toBe(1);
    store.nextStep(3);
    store.nextStep(3);
    expect(useTutorialStore.getState().active).toBe(false);
    expect(useTutorialStore.getState().currentStep).toBe(0);
  });
});
