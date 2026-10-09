import { describe, expect, it } from 'vitest';
import { mergeImageBoxes, type PdfBox } from '../lib/imageProcessing';

// PDF user space: y increases upward, so `top` >= `bottom`.
const box = (left: number, right: number, bottom: number, top: number): PdfBox => ({ left, right, bottom, top });

describe('mergeImageBoxes — one box per visible photo', () => {
  it('collapses an image + soft-mask painted at the same spot into one box', () => {
    const merged = mergeImageBoxes([
      box(100, 300, 400, 600),
      box(98, 302, 398, 602), // mask, a hair larger, fully overlapping
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(box(98, 302, 398, 602));
  });

  it('merges a tall photo sliced into stacked strips', () => {
    const merged = mergeImageBoxes([
      box(100, 300, 500, 600), // top strip
      box(100, 300, 400, 500), // bottom strip, edge-to-edge at y=500
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(box(100, 300, 400, 600));
  });

  it('merges horizontally tiled pieces of one image', () => {
    const merged = mergeImageBoxes([
      box(100, 200, 400, 600),
      box(200, 300, 400, 600), // edge-to-edge at x=200
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(box(100, 300, 400, 600));
  });

  it('keeps two genuinely distinct photos separate (real vertical gap)', () => {
    const merged = mergeImageBoxes([
      box(100, 300, 560, 660), // upper photo
      box(100, 300, 400, 530), // lower photo, 30pt gap below
    ]);
    expect(merged).toHaveLength(2);
  });

  it('keeps two side-by-side photos separate when a real gutter divides them', () => {
    const merged = mergeImageBoxes([
      box(100, 290, 400, 600),       // left photo
      box(310, 500, 400, 600),       // right photo, 20pt gutter between
    ]);
    expect(merged).toHaveLength(2);
  });
});
