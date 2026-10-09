export async function parseDocx(file: File | string): Promise<string> {
  if (typeof file === 'string') {
    return validateExtractedText(cleanText(file));
  }

  // Handle Electron environment
  if (window.electronAPI) {
    const filePath = (file as { path?: string }).path;
    if (file instanceof File && filePath) {
      const text = await window.electronAPI.readDocxPath(filePath);
      if (text) return validateExtractedText(cleanText(text));
    }
    
    if (file.name.toLowerCase().endsWith('.docx') && window.electronAPI.openDocxFile) {
      const text = await window.electronAPI.openDocxFile();
      return validateExtractedText(cleanText(text ?? ''));
    }
  }

  // Browser fallback using Mammoth directly if included (or return empty if not supported in browser)
  try {
    // Using Mammoth in browser requires array buffer
    const buffer = await file.arrayBuffer();
    // Use dynamic import to avoid bundling mammoth if not needed
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return validateExtractedText(cleanText(result.value));
  } catch {
    return '';
  }
}

function cleanText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/-\n(?=\p{Ll})/gu, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\x20-\x7E\u00A0-\u036F\u2000-\u206F\u2070-\u218F\n]/g, ' ')
    .trim();
}

function validateExtractedText(text: string) {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (text.length < 60 || tokens.length < 12 || letters / Math.max(text.length, 1) < 0.35) {
    throw new Error('Documentul Word pare gol sau extras prost. Verifică dacă fișierul conține text real, nu doar imagini/tabele.');
  }
  return text;
}
