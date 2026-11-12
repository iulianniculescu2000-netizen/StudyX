/** SVG helpers for the diagram toolbar: size reading, serialisation, PNG/SVG download. */

export interface SvgSize {
  width: number;
  height: number;
}

/** Natural size of an SVG string, from its viewBox (or width/height attributes). */
export function readSvgSize(svg: string): SvgSize {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(root);
  if (viewBox) return { width: Math.max(1, parseFloat(viewBox[1])), height: Math.max(1, parseFloat(viewBox[2])) };
  const w = /\swidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(root);
  const h = /\sheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(root);
  return { width: w ? parseFloat(w[1]) : 800, height: h ? parseFloat(h[1]) : 600 };
}

/** Extracts the `<svg>…</svg>` element from a larger HTML string (the built-in renderer wraps it). */
export function extractSvg(markup: string): string | null {
  const match = /<svg\b[\s\S]*<\/svg>/i.exec(markup);
  return match ? match[0] : null;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
};

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(input: string): Rgba | null {
  const text = input.trim().toLowerCase();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(text);
  if (fn) {
    const a = fn[4] === undefined ? 1 : fn[5] ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return { r: parseFloat(fn[1]), g: parseFloat(fn[2]), b: parseFloat(fn[3]), a };
  }
  const named = NAMED_COLORS[text];
  return named ? { r: named[0], g: named[1], b: named[2], a: 1 } : null;
}

function formatColor({ r, g, b, a }: Rgba): string {
  const ch = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const alpha = Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000;
  return alpha >= 1 ? 'rgb(' + ch(r) + ',' + ch(g) + ',' + ch(b) + ')' : 'rgba(' + ch(r) + ',' + ch(g) + ',' + ch(b) + ',' + alpha + ')';
}

/** Replaces var(--x, fallback) with its fallback (repeatedly, so nested vars resolve). */
export function resolveCssVars(svg: string): string {
  const pattern = /var\(\s*--[\w-]+\s*,\s*((?:[^()]|\([^()]*\))*?)\s*\)/gi;
  let out = svg;
  for (let i = 0; i < 6 && pattern.test(out); i += 1) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, '$1');
  }
  return out;
}

/** Resolves color-mix(in srgb, X p%, transparent|Y) into a concrete rgba()/rgb() colour. */
export function resolveColorMix(svg: string, currentColor = '#000000'): string {
  const pattern = /color-mix\(\s*in\s+srgb\s*,\s*((?:[^(),]|\([^()]*\))+?)(?:\s+([\d.]+)%)?\s*,\s*((?:[^(),]|\([^()]*\))+?)(?:\s+([\d.]+)%)?\s*\)/gi;
  let out = svg;
  for (let i = 0; i < 6 && /color-mix\(/i.test(out); i += 1) {
    const next = out.replace(pattern, (whole, c1: string, p1: string | undefined, c2: string, p2: string | undefined) => {
      const a = parseColor(/^currentcolor$/i.test(c1.trim()) ? currentColor : c1);
      const b = parseColor(/^currentcolor$/i.test(c2.trim()) ? currentColor : c2);
      if (!a || !b) return whole;
      let w1 = p1 === undefined ? (p2 === undefined ? 50 : 100 - parseFloat(p2)) : parseFloat(p1);
      let w2 = p2 === undefined ? 100 - w1 : parseFloat(p2);
      const total = w1 + w2;
      if (total <= 0) return whole;
      const alphaMultiplier = total < 100 ? total / 100 : 1;
      w1 /= total;
      w2 /= total;
      // Premultiplied mixing, as CSS color-mix does.
      const alpha = a.a * w1 + b.a * w2;
      if (alpha <= 0) return formatColor({ r: 0, g: 0, b: 0, a: 0 });
      return formatColor({
        r: (a.r * a.a * w1 + b.r * b.a * w2) / alpha,
        g: (a.g * a.a * w1 + b.g * b.a * w2) / alpha,
        b: (a.b * a.a * w1 + b.b * b.a * w2) / alpha,
        a: alpha * alphaMultiplier,
      });
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

const ALPHA_ATTRS: Record<string, string> = {
  fill: 'fill-opacity',
  stroke: 'stroke-opacity',
  'stop-color': 'stop-opacity',
  'flood-color': 'flood-opacity',
};

/** fill="rgba(r,g,b,a)" -> fill="rgb(r,g,b)" fill-opacity="a" (editors ignore alpha inside colours). */
function splitAlphaAttributes(svg: string): string {
  return svg.replace(
    /\s(fill|stroke|stop-color|flood-color)="rgba\(\s*(\d+),(\d+),(\d+),([\d.]+)\)"/g,
    (_m, attr: string, r: string, g: string, b: string, a: string) =>
      ' ' + attr + '="rgb(' + r + ',' + g + ',' + b + ')" ' + ALPHA_ATTRS[attr] + '="' + a + '"',
  );
}

/** Pure: makes an SVG independent of CSS variables, color-mix() and currentColor. */
export function resolveSvgColors(svg: string, color: string): string {
  let out = resolveCssVars(svg);
  out = resolveColorMix(out, color);
  out = out.replace(/currentColor/gi, color);
  return splitAlphaAttributes(out);
}

/**
 * A standalone SVG document: xmlns, an explicit pixel size (otherwise a
 * `width:100%` root collapses when loaded as an image) and a resolved text
 * color, since the built-in renderer draws with `currentColor`.
 */
const EXPORT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function toStandaloneSvg(svg: string, color: string, scale = 1): { markup: string; size: SvgSize } {
  const size = readSvgSize(svg);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const markup = resolveSvgColors(svg, color).replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    let next = attrs
      .replace(/\s(?:width|height)\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\sxmlns\s*=\s*["'][^"']*["']/i, '');
    // The inline style of a mermaid root says `max-width: …` / `width: 100%`.
    next = next.replace(/\sstyle\s*=\s*["']([^"']*)["']/i, (_s, css: string) => {
      // `font-family: inherit` has nothing to inherit from in a standalone file (it fell back to a serif face).
      let cleaned = css.replace(/(?:max-)?(?:width|height)\s*:[^;]+;?/gi, '').replace(/font-family\s*:\s*inherit\s*;?/gi, '').trim();
      if (!/font-family/i.test(cleaned)) cleaned = `${cleaned}${cleaned && !cleaned.endsWith(';') ? ';' : ''}font-family:${EXPORT_FONT};`;
      return ` style="${cleaned}${cleaned && !cleaned.endsWith(';') ? ';' : ''}color:${color};"`;
    });
    if (!/\sstyle\s*=/.test(next)) next += ` style="font-family:${EXPORT_FONT};color:${color};"`;
    return `<svg xmlns="http://www.w3.org/2000/svg"${next} width="${width}" height="${height}">`;
  });
  return { markup, size: { width, height } };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadSvg(svg: string, color: string, filename = 'schema.svg'): void {
  const { markup } = toStandaloneSvg(svg, color);
  triggerDownload(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

const MAX_CANVAS_SIDE = 8192;
const PNG_PADDING = 24;

/** Keep the background margin inside the browser's canvas size limit. */
export function pngRasterScale(natural: SvgSize): number {
  const drawableSide = MAX_CANVAS_SIDE - PNG_PADDING * 2;
  return Math.min(2, drawableSide / Math.max(natural.width, natural.height));
}

/** Rasterises the SVG on a canvas filled with the theme background, then downloads it. */
export async function downloadPng(svg: string, color: string, background: string, filename = 'schema.png'): Promise<void> {
  const natural = readSvgSize(svg);
  const scale = pngRasterScale(natural);
  const { markup, size } = toStandaloneSvg(svg, color, scale);

  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('svg-image'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = size.width + PNG_PADDING * 2;
  canvas.height = size.height + PNG_PADDING * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, PNG_PADDING, PNG_PADDING, size.width, size.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png');
  triggerDownload(blob, filename);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
