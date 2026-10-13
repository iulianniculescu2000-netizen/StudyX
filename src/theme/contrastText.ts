/**
 * Picks readable text for a solid coloured fill (a folder colour, a tour step accent…).
 * White when it reaches WCAG AA (4.5:1) on the fill, otherwise near-black.
 */
const DARK_TEXT = '#1D1D1F';
const LIGHT_TEXT = '#FFFFFF';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Text colour (white or near-black) with the best readability on `fill`; white for non-hex values. */
export function onFillText(fill: string): string {
  if (!parseHex(fill)) return LIGHT_TEXT;
  return contrastRatio(LIGHT_TEXT, fill) >= 4.5 ? LIGHT_TEXT : DARK_TEXT;
}
