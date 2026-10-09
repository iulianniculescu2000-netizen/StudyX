import { describe, expect, it } from 'vitest';
import { clipToViewport, computeCardLayout, GAP, PAD } from './placement';

const inView = (l: ReturnType<typeof computeCardLayout>, vw: number, vh: number) => {
  expect(l.left).toBeGreaterThanOrEqual(0);
  expect(l.left + l.width).toBeLessThanOrEqual(vw);
  expect(l.top).toBeGreaterThanOrEqual(0);
  expect(l.top + l.maxHeight).toBeLessThanOrEqual(vh);
};

describe('computeCardLayout', () => {
  it('centers without a target', () => {
    const l = computeCardLayout({ target: null, vw: 1440, vh: 900 });
    expect(l.mode).toBe('center');
    inView(l, 1440, 900);
  });

  it('puts the card on the preferred side when it fits', () => {
    const l = computeCardLayout({ target: { top: 200, left: 100, width: 300, height: 100 }, vw: 1440, vh: 900, preferred: 'right' });
    expect(l.placement).toBe('right');
    expect(l.left).toBe(100 + 300 + GAP);
  });

  it('1366x768: target in the lower half goes above/beside, never past the bottom edge', () => {
    const target = { top: 120, left: 156, width: 1130, height: 285 };
    const l = computeCardLayout({ target, vw: 1366, vh: 768, preferred: 'bottom', cardHeight: 420 });
    inView(l, 1366, 768);
    expect(l.maxHeight).toBeGreaterThanOrEqual(200);
  });

  it('shrinks the card (scrolling body) instead of overflowing below the target', () => {
    const l = computeCardLayout({ target: { top: 100, left: 200, width: 900, height: 300 }, vw: 1366, vh: 768, preferred: 'bottom', cardHeight: 600 });
    expect(l.top + l.maxHeight).toBeLessThanOrEqual(768 - PAD);
  });

  it('target taller than the viewport: card overlays as a sheet inside the screen', () => {
    const l = computeCardLayout({ target: { top: -200, left: 50, width: 1200, height: 1400 }, vw: 1366, vh: 768, preferred: 'right', cardHeight: 400 });
    expect(l.mode).toBe('sheet');
    inView(l, 1366, 768);
  });

  it('narrow or short screens use a bottom sheet', () => {
    const phone = computeCardLayout({ target: { top: 100, left: 10, width: 100, height: 50 }, vw: 390, vh: 800 });
    expect(phone.mode).toBe('sheet');
    inView(phone, 390, 800);
    const short = computeCardLayout({ target: { top: 100, left: 10, width: 100, height: 50 }, vw: 1200, vh: 420 });
    expect(short.mode).toBe('sheet');
    inView(short, 1200, 420);
  });
});

describe('clipToViewport', () => {
  it('limits a big box to the screen', () => {
    expect(clipToViewport({ top: -50, left: -10, width: 5000, height: 5000 }, 1366, 768)).toEqual({ top: 0, left: 0, width: 1366, height: 768 });
  });
  it('returns null when fully outside', () => {
    expect(clipToViewport({ top: 900, left: 0, width: 10, height: 10 }, 1366, 768)).toBeNull();
  });
});
