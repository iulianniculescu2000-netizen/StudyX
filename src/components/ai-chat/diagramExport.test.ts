import { describe, expect, it } from 'vitest';
import { pngRasterScale, readSvgSize, toStandaloneSvg } from './diagramExport';

describe('diagram export dimensions', () => {
  it('keeps a large PNG inside the canvas limit including its margin', () => {
    const size = readSvgSize('<svg viewBox="0 0 9000 2000"></svg>');
    const scale = pngRasterScale(size);
    const standalone = toStandaloneSvg('<svg viewBox="0 0 9000 2000"></svg>', '#111111', scale);
    expect(standalone.size.width + 48).toBeLessThanOrEqual(8192);
    expect(standalone.size.height + 48).toBeLessThanOrEqual(8192);
  });

  it('preserves the 2x export for an ordinary diagram', () => {
    expect(pngRasterScale({ width: 800, height: 500 })).toBe(2);
  });
});
