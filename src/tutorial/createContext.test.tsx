import { afterEach, describe, expect, it } from 'vitest';
import { createTour } from './tours/create';
import { readTourContext } from './useTourContext';

let fixture: HTMLDivElement | undefined;
function show(...anchors: string[]) {
  fixture = document.createElement('div');
  for (const anchor of anchors) {
    const element = document.createElement('div');
    element.dataset.tutorial = anchor;
    fixture.append(element);
  }
  document.body.append(fixture);
}
const stepsAt = (path: string, search = '') => {
  const context = readTourContext(path, search);
  return createTour.steps.filter((step) => !step.when || step.when(context));
};
afterEach(() => { fixture?.remove(); fixture = undefined; });

describe('create guide context', () => {
  it('explains later stages from Settings without opening tabs or generating questions', () => {
    const steps = stepsAt('/settings');
    expect(steps.map((step) => step.id)).toEqual(['create-intro-open', 'create-title', 'create-options', 'create-questions-overview', 'create-ai-overview']);
    expect(steps.filter((step) => step.id.endsWith('-overview')).every((step) => !step.target && !step.route && !step.completeWhen && !step.Extra)).toBe(true);
  });

  it('highlights the existing editor and skips controls from the information stage', () => {
    show('create-question-tabs', 'create-question-editor');
    const steps = stepsAt('/create');
    expect(steps.map((step) => step.id)).toEqual(['create-intro', 'create-questions', 'create-ai-overview']);
    expect(steps[1].target).toBe('[data-tutorial="create-question-editor"]');
    expect(steps[1].optional).toBe(true);
    expect(steps[1].route).toBeUndefined();
  });

  it('highlights the AI panel only when it is already present', () => {
    show('create-question-tabs', 'create-question-editor', 'create-ai-panel');
    const steps = stepsAt('/create');
    expect(steps.map((step) => step.id)).toEqual(['create-intro', 'create-questions', 'create-ai']);
    expect(steps[2].target).toBe('[data-tutorial="create-ai-panel"]');
    expect(steps[2].route).toBeUndefined();
    expect(steps[2].completeWhen).toBeUndefined();
  });

  it('preserves editing and folder queries when opened on the creation page', () => {
    const steps = stepsAt('/create', '?edit=existing&folder=target');
    expect(steps.every((step) => !step.route)).toBe(true);
    expect(steps[0].id).toBe('create-intro');
  });
});
