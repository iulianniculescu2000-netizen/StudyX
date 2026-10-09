import { useTheme } from '../../theme/ThemeContext';

export const number = (value: number, digits = 0) =>
  value.toLocaleString('ro-RO', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pages = (p: number) => {
  const r = Math.round(p * 10) / 10;
  return `${number(r, r % 1 ? 1 : 0)} ${r === 1 ? 'pagină' : 'pagini'}`;
};

/** Colour of a pass: blue, green, orange, red; purple for simulations. */
export function usePassColors() {
  const theme = useTheme();
  return [theme.accent, theme.success, theme.warning, theme.danger, theme.accent2];
}

const BOOK_TONE = { K: 'accent', L: 'success', S: 'warning' } as const;

/** One colour per book, so a dot tells where a topic comes from. */
export function useBookColor() {
  const theme = useTheme();
  return (book: 'K' | 'L' | 'S') => theme[BOOK_TONE[book]];
}
