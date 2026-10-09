/**
 * Tooltipul armonizat al aplicației (înlocuiește tooltipul nativ al browserului, pătrat și cu contur negru, care apărea
 * la orice `title=`). Piese pure: găsirea textului de arătat și poziționarea, ca să se testeze fără DOM real.
 */

/** Cât așteptăm înainte să arătăm tooltipul (ca cel nativ: nu apare la o trecere grăbită cu mouse-ul). */
export const TOOLTIP_DELAY_MS = 380;
const MARGIN = 8;
const GAP = 8;
const MAX_WIDTH = 280;
const LINE_HEIGHT = 18;
const PADDING_X = 12;
const PADDING_Y = 6;
const CHAR_WIDTH = 6.6;

export interface TooltipBox { width: number; height: number }

/** Dimensiunea estimată a tooltipului din text (evită o măsurare în două treceri; textele sunt scurte). */
export function estimateTooltipBox(text: string): TooltipBox {
  const natural = Math.ceil(text.length * CHAR_WIDTH) + PADDING_X * 2;
  const width = Math.min(MAX_WIDTH, Math.max(48, natural));
  const charsPerLine = Math.max(1, Math.floor((width - PADDING_X * 2) / CHAR_WIDTH));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return { width, height: lines * LINE_HEIGHT + PADDING_Y * 2 };
}

export interface TooltipPlacement {
  top: number;
  /** Centrul orizontal al tooltipului (se aplică cu translateX(-50%)). */
  centerX: number;
  side: 'below' | 'above';
}

/** Sub element, dacă încape; altfel deasupra; centrat pe element și ținut în ecran. */
export function placeTooltip(
  target: { top: number; left: number; width: number; height: number },
  box: TooltipBox,
  viewport: { width: number; height: number },
): TooltipPlacement {
  const half = box.width / 2;
  const centerRaw = target.left + target.width / 2;
  const centerX = Math.min(Math.max(centerRaw, MARGIN + half), Math.max(MARGIN + half, viewport.width - MARGIN - half));
  const below = target.top + target.height + GAP;
  const fitsBelow = below + box.height + MARGIN <= viewport.height;
  if (fitsBelow) return { top: below, centerX, side: 'below' };
  return { top: Math.max(MARGIN, target.top - GAP - box.height), centerX, side: 'above' };
}

/** Elementele pentru care `title` nu e un tooltip (SVG are <title> ca element; iframe-urile îl folosesc ca nume). */
const SKIP_TAGS = new Set(['IFRAME', 'SVG', 'TITLE', 'HTML', 'HEAD', 'BODY']);

export const TIP_ATTR = 'data-tip';

/**
 * Cel mai apropiat strămoș cu text de tooltip. Un `title` nativ este mutat în `data-tip` (ca browserul să nu mai arate
 * tooltipul lui), iar elementul fără text vizibil și fără `aria-label` primește textul ca nume accesibil.
 */
export function claimTooltipText(start: Element | null): { element: Element; text: string } | null {
  for (let el: Element | null = start; el && el !== el.ownerDocument.body; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName.toUpperCase())) continue;
    const native = el.getAttribute('title');
    if (native !== null) {
      const text = native.trim();
      el.removeAttribute('title');
      if (!text) continue;
      el.setAttribute(TIP_ATTR, text);
      if (!el.hasAttribute('aria-label') && !(el.textContent ?? '').trim()) el.setAttribute('aria-label', text);
      return { element: el, text };
    }
    const kept = el.getAttribute(TIP_ATTR);
    if (kept) return { element: el, text: kept };
  }
  return null;
}
