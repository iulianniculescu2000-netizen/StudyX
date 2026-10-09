export async function parseImageOCR(file: File | string): Promise<string> {
  if (typeof file === 'string' && !file.startsWith('data:')) {
    return validateOCRText(cleanText(file));
  }

  // Handle Electron environment
  if (window.electronAPI) {
    const filePath = (file as { path?: string }).path;
    if (file instanceof File && filePath) {
      const text = await window.electronAPI.readOCRPath(filePath);
      if (text) return validateOCRText(cleanText(text));
    }
    
    // If just calling it manually (opens dialog)
    const api = window.electronAPI as { openOCRImage?: () => Promise<string | null> };
    if (typeof file === 'object' && file.type?.startsWith('image/') && api.openOCRImage) {
      const text = await api.openOCRImage();
      return validateOCRText(cleanText(text ?? ''));
    }
  }

  // Browser fallback (commented out to avoid Vite resolve errors until installed)
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('ron');
    const source = file as string | File;
    const ret = await worker.recognize(source);
    await worker.terminate();
    return validateOCRText(cleanText(ret.data.text));
  } catch (e) {
    console.error('OCR Error:', e);
    return '';
  }
}

function cleanText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\x20-\x7E\u00A0-\u036F\u2000-\u206F\u2070-\u218F\n]/g, ' ')
    .trim();
}

function validateOCRText(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (text.length < 40 || words.length < 8 || letters / Math.max(text.length, 1) < 0.25) {
    throw new Error('OCR-ul nu a extras suficient text clar. Încearcă o imagine mai curată, contrast mai mare sau un PDF digital.');
  }
  return text;
}
