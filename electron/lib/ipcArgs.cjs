'use strict';

const path = require('path');
const fsp = require('fs/promises');

/**
 * Plafoane pentru fișierele citite din cale (alese larg: cărțile PDF pot fi mari, iar fișierul se citește oricum întreg în memorie
 * de extractori; plafonul oprește doar cereri absurde, nu utilizarea normală).
 */
const MAX_PDF_BYTES = 500 * 1024 * 1024;
const MAX_DOCX_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
/** Text salvat din dialog (export JSON/CSV) și copie de siguranță: aceeași limită ca `storage:save` (500 MB). */
const MAX_TEXT_CHARS = 500 * 1024 * 1024;
const MAX_PATH_CHARS = 32768;

const PDF_EXTS = ['.pdf'];
const DOCX_EXTS = ['.docx'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

/**
 * Verifică o cale primită din pagină: șir nenul, absolută, cu extensie permisă, fișier obișnuit (nu folder, nu dispozitiv)
 * și în plafon. Nu restrânge la un folder: fișierele trase cu mouse-ul pot veni de oriunde.
 * @returns {Promise<string|null>} calea gata de citit sau null
 */
async function resolveReadableFile(filePath, { exts, maxBytes }, fs = fsp) {
  if (typeof filePath !== 'string') return null;
  if (!filePath.trim() || filePath.length > MAX_PATH_CHARS || filePath.includes('\0')) return null;
  if (!path.isAbsolute(filePath)) return null;
  if (!exts.includes(path.extname(filePath).toLowerCase())) return null;
  try {
    const st = await fs.stat(filePath);
    if (!st.isFile() || st.size > maxBytes) return null;
  } catch {
    return null;
  }
  return filePath;
}

/** `win:setContentProtection`: numai un boolean adevărat/fals; altceva => null (se ignoră). */
function parseBooleanArg(value) {
  return typeof value === 'boolean' ? value : null;
}

/** Argumentul dialogurilor de salvare: `{ defaultPath?, content }`. Null dacă nu se poate salva nimic. */
function parseSaveArgs(opts, maxChars = MAX_TEXT_CHARS) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (typeof o.content !== 'string' || o.content.length > maxChars) return null;
  const defaultPath = typeof o.defaultPath === 'string' && o.defaultPath.length > 0 && o.defaultPath.length <= 1024 && !o.defaultPath.includes('\0')
    ? o.defaultPath
    : undefined;
  return { defaultPath, content: o.content };
}

/** Argumentul `app:autoBackup`: `{ data, kind? }`; `kind` e fie „pre-update”, fie obișnuit. Null dacă datele lipsesc sau sunt prea mari. */
function parseAutoBackupArgs(arg, maxChars = MAX_TEXT_CHARS) {
  const o = arg && typeof arg === 'object' ? arg : {};
  if (typeof o.data !== 'string' || o.data.length === 0 || o.data.length > maxChars) return null;
  return { data: o.data, kind: o.kind === 'pre-update' ? 'pre-update' : 'daily' };
}

module.exports = {
  MAX_PDF_BYTES, MAX_DOCX_BYTES, MAX_IMAGE_BYTES, MAX_TEXT_CHARS, MAX_PATH_CHARS,
  PDF_EXTS, DOCX_EXTS, IMAGE_EXTS,
  resolveReadableFile, parseBooleanArg, parseSaveArgs, parseAutoBackupArgs,
};
