import { afterEach, describe, expect, it } from 'vitest';
import { residencyTour } from './tours/residency';
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
const activeSteps = () => {
  const context = readTourContext('/rezidentiat');
  return residencyTour.steps.filter((step) => !step.when || step.when(context));
};
afterEach(() => { fixture?.remove(); fixture = undefined; });

describe('residency guide context', () => {
  it('preserves the open AI dialog and points at its actual choices', () => {
    show('rez-ai-level', 'rez-ai-type', 'rez-ai-folder');
    const steps = activeSteps();
    expect(steps.map((step) => step.id)).toEqual(['rez-ai-intro', 'rez-ai-level-guide', 'rez-ai-type-guide', 'rez-ai-folder-guide']);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(steps.every((step) => !step.route && !step.completeWhen && !step.Extra)).toBe(true);
    for (const step of steps.filter((step) => step.target)) {
      expect(document.querySelector(step.target!)).toBeTruthy();
      expect(step.optional).toBe(true);
    }
  });

  it('keeps the import guide in the destination dialog without opening a file', () => {
    show('rez-import-folder');
    const steps = activeSteps();
    expect(steps.map((step) => step.id)).toEqual(['rez-import-intro', 'rez-import-folder-guide', 'rez-import-file-guide']);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(steps.every((step) => !step.route && !step.completeWhen && !step.Extra)).toBe(true);
  });

  it('shows only the page overview when no dialog is open', () => {
    const steps = activeSteps();
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(steps.every((step) => step.id.startsWith('residency-') && step.route === '/rezidentiat')).toBe(true);
  });
});
