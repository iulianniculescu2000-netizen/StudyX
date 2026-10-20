import { parseDay } from './engine';

type Format = Intl.DateTimeFormatOptions;
const fmt = (day: string, options: Format) => parseDay(day).toLocaleDateString('ro-RO', options);

/** "6 oct." */
export const shortDay = (day: string) => fmt(day, { day: 'numeric', month: 'short' });
/** "6 oct. 2026" */
export const dayYear = (day: string) => fmt(day, { day: 'numeric', month: 'short', year: 'numeric' });
/** "21 noiembrie 2027" */
export const longDay = (day: string) => fmt(day, { day: 'numeric', month: 'long', year: 'numeric' });
/** "mar., 6 oct." */
export const weekdayDay = (day: string) => fmt(day, { weekday: 'short', day: 'numeric', month: 'short' });
/** "15 mar. – 10 iul. 2027", or "6 oct. 2026 – 13 mar. 2027" when the range crosses a year. */
export const dayRangeYear = (from: string, to: string) =>
  (from.slice(0, 4) === to.slice(0, 4) ? `${shortDay(from)} – ${dayYear(to)}` : `${dayYear(from)} – ${dayYear(to)}`);
/** "6 oct. – 12 oct." (or one date when both ends are the same day) */
export const dayRange = (from: string, to: string) => (from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`);
export const monthName = (day: string) => {
  const name = fmt(day, { month: 'long', year: 'numeric' });
  return name.charAt(0).toUpperCase() + name.slice(1);
};
/** "1. Sepsisul…" → "Sepsisul…" */
export const withoutNumber = (text: string) => text.replace(/^\d+\.\s*/, '');
/** "Kumar p.151-153" → "151-153" */
export const pageRange = (src: string) => src.replace(/^\w+ p\./, '');

/** Lower-case and without diacritics, so "fibrilație" finds "Fibrilatia". */
export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
