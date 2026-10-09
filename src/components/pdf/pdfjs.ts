import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/**
 * pdf.js se încarcă la prima folosire (e mare). Varianta „legacy” rulează și în browsere/Chromium-uri mai vechi
 * (cea modernă cere API-uri foarte noi, ex. Map.getOrInsertComputed); workerul e cel din aceeași variantă.
 */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
}
