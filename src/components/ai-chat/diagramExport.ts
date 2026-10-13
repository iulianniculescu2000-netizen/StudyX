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

/**
 * A standalone SVG document: xmlns, an explicit pixel size (otherwise a
 * `width:100%` root collapses when loaded as an image) and a resolved text
 * color, since the built-in renderer draws with `currentColor`.
 */
export function toStandaloneSvg(svg: string, color: string, scale = 1): { markup: string; size: SvgSize } {
  const size = readSvgSize(svg);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const markup = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    let next = attrs
      .replace(/\s(?:width|height)\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\sxmlns\s*=\s*["'][^"']*["']/i, '');
    // The inline style of a mermaid root says `max-width: …` / `width: 100%`.
    next = next.replace(/\sstyle\s*=\s*["']([^"']*)["']/i, (_s, css: string) => {
      const cleaned = css.replace(/(?:max-)?(?:width|height)\s*:[^;]+;?/gi, '').trim();
      return ` style="${cleaned}${cleaned && !cleaned.endsWith(';') ? ';' : ''}color:${color};"`;
    });
    if (!/\sstyle\s*=/.test(next)) next += ` style="color:${color};"`;
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
