// Re-export al reconstructorului pur din electron/ (sursă unică pentru worker și renderer).
export { orderLines, processPage, cleanLineText, normalizeDiacritics, matchRunningHeader, formatPageMarker, pageNeedsOcr, countImageOps, OCR_MAX_LETTERS } from '../../../electron/pdfReadingOrder.mjs';
export type { PdfTextItem, OrderedLine } from '../../../electron/pdfReadingOrder.mjs';
