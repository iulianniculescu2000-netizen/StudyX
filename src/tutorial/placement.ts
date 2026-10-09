// Pure geometry for the tour card: given the target's rect, the viewport and the card's natural size,
// decide where the card goes and how tall it may be. No DOM access, so it is unit-tested directly.

export interface Box { top: number; left: number; width: number; height: number }
export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Placement = Side | 'center';

export interface CardLayout {
  /** Where the card ended up; 'center' means no arrow (centered or bottom sheet). */
  placement: Placement;
  mode: 'anchored' | 'center' | 'sheet';
  left: number;
  top: number;
  width: number;
  /** The card never grows past this; its body scrolls, its footer stays put. */
  maxHeight: number;
}

export interface LayoutInput {
  /** Target rect in viewport coordinates (already padded), or null when there is no target. */
  target: Box | null;
  vw: number;
  vh: number;
  preferred?: Placement;
  /** Natural (unconstrained) card height; a guess is fine before it is measured. */
  cardHeight?: number;
}

export const PAD = 12;
export const GAP = 16;
const CARD_W = 340;
const MIN_USEFUL_H = 200;
/** Below these the card cannot sit beside a target: it becomes a bottom sheet. */
const SHEET_W = 560;
const SHEET_H = 480;

/** Highlight limited to what is actually visible, so a huge target never paints outside the screen. */
export function clipToViewport(box: Box, vw: number, vh: number): Box | null {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(vw, box.left + box.width);
  const bottom = Math.min(vh, box.top + box.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

const centered = (vw: number, vh: number, cardHeight: number): CardLayout => {
  const width = Math.max(240, Math.min(380, vw - PAD * 2));
  const h = Math.min(cardHeight, Math.max(160, vh - PAD * 2));
  const top = Math.max(PAD, Math.round((vh - h) / 2));
  return { placement: 'center', mode: 'center', width, maxHeight: Math.max(120, vh - top - PAD), left: Math.round((vw - width) / 2), top };
};

const sheet = (vw: number, vh: number, cardHeight: number): CardLayout => {
  const maxHeight = Math.max(160, Math.min(cardHeight, Math.round(vh * 0.55), vh - PAD * 2));
  return { placement: 'center', mode: 'sheet', width: vw - PAD * 2, left: PAD, maxHeight, top: vh - PAD - maxHeight };
};

export function computeCardLayout({ target, vw, vh, preferred = 'right', cardHeight = 320 }: LayoutInput): CardLayout {
  const narrow = vw < SHEET_W || vh < SHEET_H;
  if (narrow) return sheet(vw, vh, cardHeight);
  if (!target || preferred === 'center') return centered(vw, vh, cardHeight);

  const width = Math.min(CARD_W, vw - PAD * 2);
  const fullH = Math.min(cardHeight, vh - PAD * 2);
  const clampLeft = (x: number) => Math.max(PAD, Math.min(x, vw - width - PAD));
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;

  const space: Record<Side, number> = {
    top: target.top - GAP - PAD,
    bottom: vh - PAD - (target.top + target.height + GAP),
    left: target.left - GAP - PAD,
    right: vw - PAD - (target.left + target.width + GAP),
  };
  const fits = (s: Side) => (s === 'left' || s === 'right' ? space[s] >= width : space[s] >= fullH);

  const make = (s: Side): CardLayout => {
    if (s === 'bottom' || s === 'top') {
      const maxHeight = Math.max(MIN_USEFUL_H, Math.min(cardHeight, space[s]));
      const top = s === 'bottom' ? target.top + target.height + GAP : target.top - GAP - maxHeight;
      return { placement: s, mode: 'anchored', width, left: clampLeft(cx - width / 2), top: Math.max(PAD, top), maxHeight };
    }
    const h = fullH;
    const top = Math.max(PAD, Math.min(cy - h / 2, vh - PAD - h));
    const left = s === 'right' ? target.left + target.width + GAP : target.left - GAP - width;
    return { placement: s, mode: 'anchored', width, left, top, maxHeight: h };
  };

  const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const pref = preferred as Side;
  const order: Side[] = [pref, opposite[pref], ...(['bottom', 'top', 'right', 'left'] as Side[]).filter((s) => s !== pref && s !== opposite[pref])];

  const full = order.find(fits);
  if (full) return make(full);

  // Nothing fits at full height: take the roomiest vertical side if it still gives a usable card
  // (the body scrolls), otherwise the target is too large to go around and the card overlays it.
  const vertical = (['bottom', 'top'] as Side[]).sort((a, b) => space[b] - space[a])[0];
  if (space[vertical] >= MIN_USEFUL_H) return make(vertical);
  return sheet(vw, vh, cardHeight);
}
