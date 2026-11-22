import { afterEach, describe, expect, it } from 'vitest';
import { installConsoleHelper, isCompositorFriendly, snapshotRenderCost, summarizeFrames } from './perfProbe';

afterEach(() => { document.body.innerHTML = ''; });

describe('perfProbe', () => {
  it('transform/opacitate pe HTML rulează pe compozitor; în interiorul SVG sau cu filter, nu', () => {
    const div = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    svg.appendChild(circle);
    expect(isCompositorFriendly(div, ['transform', 'opacity'])).toBe(true);
    expect(isCompositorFriendly(svg, ['transform'])).toBe(true);
    expect(isCompositorFriendly(circle, ['opacity'])).toBe(false);
    expect(isCompositorFriendly(div, ['transform', 'filter'])).toBe(false);
    expect(isCompositorFriendly(div, [])).toBe(false);
    expect(isCompositorFriendly(null, ['opacity'])).toBe(false);
  });

  it('rezumă cadrele: cadre/s, cadre lungi, cel mai lung', () => {
    expect(summarizeFrames([16, 17, 16, 70, 16], 1000)).toEqual({ fps: 5, longFrames: 1, worstFrameMs: 70 });
    expect(summarizeFrames([], 1000)).toEqual({ fps: 0, longFrames: 0, worstFrameMs: 0 });
  });

  it('numără elementele cu backdrop-filter, filter și will-change', () => {
    document.body.innerHTML = '<div style="backdrop-filter: blur(4px)"></div><div style="filter: blur(2px)"></div><div style="will-change: transform"></div><div></div>';
    const snap = snapshotRenderCost();
    expect(snap.filters).toBe(1);
    expect(snap.willChange).toBe(1);
    // jsdom poate să nu cunoască backdrop-filter; nu trebuie să numere greșit elementele simple.
    expect(snap.backdropFilters).toBeLessThanOrEqual(1);
    expect(snap.mainThreadLoops).toEqual([]);
  });

  it('pune și scoate __studyxPerf din window', () => {
    const remove = installConsoleHelper(window);
    expect(typeof (window as Window & { __studyxPerf?: unknown }).__studyxPerf).toBe('function');
    remove();
    expect((window as Window & { __studyxPerf?: unknown }).__studyxPerf).toBeUndefined();
  });
});
