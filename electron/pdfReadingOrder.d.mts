export interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}
export interface OrderedLine {
  text: string;
  y: number;
  h: number;
  kind: 'full' | 'left' | 'right' | 'single';
  blankBefore: boolean;
}
export function orderLines(items: readonly Partial<PdfTextItem>[]): {
  lines: OrderedLine[];
  columns: 1 | 2;
  yTop: number;
  yBottom: number;
};
export function normalizeDiacritics(s: string): string;
export function cleanLineText(raw: string): string;
export function matchRunningHeader(text: string): { printedPage: number; title: string } | null;
export function processPage(items: readonly Partial<PdfTextItem>[]): {
  text: string;
  printedPage?: number;
  runningTitle?: string;
  columns: 1 | 2;
};
export const OCR_MAX_LETTERS: number;
export function pageNeedsOcr(page: { text: string; imageCount?: number }): boolean;
export function countImageOps(operatorList: { fnArray?: ArrayLike<number> } | null | undefined, OPS: Record<string, number>): number;
export function formatPageMarker(page: number, printedPage?: number, needsOcr?: boolean): string;
