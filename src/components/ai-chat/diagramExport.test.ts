import { describe, expect, it } from 'vitest';
import { pngRasterScale, readSvgSize, resolveColorMix, resolveCssVars, toStandaloneSvg } from './diagramExport';

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

describe('export colour resolution', () => {
  it('resolves var() fallbacks, including nested ones', () => {
    expect(resolveCssVars('<path fill="var(--sx-ok, #30a46c)"/>')).toBe('<path fill="#30a46c"/>');
    expect(resolveCssVars('x var(--a, var(--b, #fff)) y')).toBe('x #fff y');
  });

  it('turns color-mix with transparent into rgba', () => {
    expect(resolveColorMix('fill="color-mix(in srgb, #ff0000 40%, transparent)"')).toBe('fill="rgba(255,0,0,0.4)"');
    expect(resolveColorMix('color-mix(in srgb, rgb(0, 128, 255) 50%, transparent)')).toBe('rgba(0,128,255,0.5)');
  });

  it('mixes two opaque colours', () => {
    expect(resolveColorMix('color-mix(in srgb, #000000 50%, #ffffff)')).toBe('rgb(128,128,128)');
  });

  it('leaves unknown colours untouched', () => {
    const src = 'color-mix(in srgb, var(--x) 40%, transparent)';
    expect(resolveColorMix(src)).toBe(src);
  });

  it('standalone export has no var/color-mix/currentColor and splits alpha into opacity', () => {
    const svg =
      '<svg viewBox="0 0 10 10"><rect fill="color-mix(in srgb, var(--sx-danger, #e5484d) 20%, transparent)" stroke="currentColor"/></svg>';
    const { markup } = toStandaloneSvg(svg, '#112233');
    expect(markup).not.toMatch(/var\(|color-mix|currentColor/i);
    expect(markup).toContain('fill="rgb(229,72,77)" fill-opacity="0.2"');
    expect(markup).toContain('stroke="#112233"');
  });
});

describe('fontul SVG-ului exportat', () => {
  it('nu rămâne `inherit` (în fișier ar ieși cu serife): primește o familie concretă', async () => {
    const { toStandaloneSvg } = await import('./diagramExport');
    const svg = '<svg viewBox="0 0 100 50" style="display:block;font-family:inherit;max-width:100%"><text>a</text></svg>';
    const { markup } = toStandaloneSvg(svg, '#111111');
    expect(markup).not.toMatch(/font-family\s*:\s*inherit/i);
    expect(markup).toMatch(/font-family:[^;"]*sans-serif/);
    expect(toStandaloneSvg('<svg viewBox="0 0 10 10"></svg>', '#111').markup).toMatch(/font-family:[^;"]*sans-serif/);
  });
});
