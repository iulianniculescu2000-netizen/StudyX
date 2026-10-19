/**
 * Cursorul StudyX ca imagini SVG date sistemului (`cursor: image-set(...)`), nu ca element care urmărește mouse-ul:
 * sistemul îl desenează direct, deci se mișcă exact cât săgeata nativă, fără niciun cadru de întârziere.
 * Fiecare imagine are și varianta 2x, ca să rămână clară pe ecranele cu densitate mare.
 */

const INK = '#1c1c1e';
const PAPER = '#ffffff';

const SHADOW = `<filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0.9" stdDeviation="0.8" flood-color="#000" flood-opacity="0.32"/></filter>`;

/** Săgeată rotunjită, închisă la culoare, cu margine albă (se vede pe orice fundal). Vârful e la (4.5, 3). */
const ARROW = `<path d="M4.5 3 L4.5 18.4 L8.6 14.7 L11.3 20.8 L13.9 19.7 L11.3 13.8 L16.8 13.8 Z" fill="${INK}" stroke="${PAPER}" stroke-width="1.5" stroke-linejoin="round"/>`;

/** Mână cu degetul arătător; vârful degetului e la (9, 2.5). */
const HAND_SHAPE = `<path d="M7.5 4 A1.5 1.5 0 0 1 10.5 4 L10.5 9.7 A1.35 1.35 0 0 1 13.2 10.1 A1.3 1.3 0 0 1 15.8 10.9 A1.2 1.2 0 0 1 18.2 11.9 L18.2 15.4 C18.2 18.6 16.4 20.8 13.4 20.8 L12.1 20.8 C10.3 20.8 9.1 20 8.1 18.6 L5.3 14.5 A1.45 1.45 0 0 1 7.5 12.6 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.25" stroke-linejoin="round"/><path d="M10.5 10 V12.6 M13.2 10.5 V12.8 M15.8 11.2 V13" stroke="${INK}" stroke-opacity="0.55" stroke-width="1" stroke-linecap="round"/>`;

/** Cursor de text cu capete curbate, ca în macOS. Centrul e la (12, 12). */
const IBEAM_PATH = 'M9 4.5 Q12 4.5 12 6.6 Q12 4.5 15 4.5 M12 6.6 V17.4 M9 19.5 Q12 19.5 12 17.4 Q12 19.5 15 19.5';
const IBEAM = `<path d="${IBEAM_PATH}" fill="none" stroke="${PAPER}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${IBEAM_PATH}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;

const busyBadge = (accent: string) =>
  `<circle cx="18.6" cy="18.6" r="4.1" fill="${PAPER}"/><circle cx="18.6" cy="18.6" r="2.7" fill="none" stroke="${accent}" stroke-opacity="0.25" stroke-width="1.5"/><path d="M18.6 15.9 A2.7 2.7 0 0 1 21.3 18.6" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round"/>`;

function svg(body: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${SHADOW}<g filter="url(#s)">${body}</g></svg>`;
}

const dataUrl = (markup: string) => `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;

/** Valoarea completă pentru `cursor`: imaginea 1x/2x, punctul activ (în pixeli CSS) și cursorul nativ de rezervă. */
export function cursorValue(body: string, hotspotX: number, hotspotY: number, fallback: string): string {
  return `image-set(${dataUrl(svg(body, 24))} 1x, ${dataUrl(svg(body, 48))} 2x) ${hotspotX} ${hotspotY}, ${fallback}`;
}

export interface StudyXCursorVars {
  '--sx-cursor-arrow': string;
  '--sx-cursor-hand': string;
  '--sx-cursor-hand-pressed': string;
  '--sx-cursor-text': string;
}

/** Variabilele CSS ale cursorului; `busy` adaugă lângă săgeată un mic indicator de lucru în culoarea temei. */
export function buildCursorVars(accent: string, busy: boolean): StudyXCursorVars {
  return {
    '--sx-cursor-arrow': cursorValue(busy ? ARROW + busyBadge(accent) : ARROW, 4, 3, busy ? 'progress' : 'default'),
    '--sx-cursor-hand': cursorValue(HAND_SHAPE, 9, 2, 'pointer'),
    // Apăsat: aceeași mână, puțin mai mică în jurul vârfului degetului (punctul activ nu se mută).
    '--sx-cursor-hand-pressed': cursorValue(`<g transform="translate(0.9 0.25) scale(0.9)">${HAND_SHAPE}</g>`, 9, 2, 'pointer'),
    '--sx-cursor-text': cursorValue(IBEAM, 12, 12, 'text'),
  };
}
