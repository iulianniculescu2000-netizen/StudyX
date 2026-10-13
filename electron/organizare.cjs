/**
 * Organizare: opens the study files named in the plan (a Kumar chapter PDF, a book) from the folder
 * the user picked. Only the picked folder is ever read (`organizare:resolve-root` additionally lists FOLDER NAMES around the pick to find
 * the one holding Carti/Capitole), and only document and image types are opened,
 * so a plan entry can never launch an arbitrary program.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { findMaterialsRoot, detectMaterialsRoot, commonBases } = require('./lib/materialsRoot.cjs');
const { isSafeStorageId } = require('./lib/validate.cjs');

const OPENABLE = new Set(['.pdf', '.doc', '.docx', '.odt', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.webp']);

/** Resolves `relPath` inside `root`, or null if it would leave the folder or is not an openable document. */
function resolveInsideRoot(root, relPath) {
  if (typeof root !== 'string' || typeof relPath !== 'string' || !root || !relPath) return null;
  const base = path.resolve(root);
  const full = path.resolve(base, relPath);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  if (!OPENABLE.has(path.extname(full).toLowerCase())) return null;
  return full;
}

/** Largest PDF the in-app viewer will load (a compiled book is well under this). */
const MAX_PDF_BYTES = 200 * 1024 * 1024;

/** Like resolveInsideRoot, but only for a .pdf (the in-app viewer reads bytes, never launches anything). */
function resolvePdfInsideRoot(root, relPath) {
  const full = resolveInsideRoot(root, relPath);
  return full && path.extname(full).toLowerCase() === '.pdf' ? full : null;
}

/** Reads a PDF under `root`: symlinks that lead outside the folder are refused, and so is anything over the size cap. */
async function readPdfInsideRoot(root, relPath) {
  const full = resolvePdfInsideRoot(root, relPath);
  if (!full) return { ok: false, code: 'invalid', error: 'Fișier invalid.' };
  try {
    const [realBase, realFull] = await Promise.all([fs.promises.realpath(path.resolve(root)), fs.promises.realpath(full)]);
    if (realFull !== realBase && !realFull.startsWith(realBase + path.sep)) return { ok: false, code: 'invalid', error: 'Fișier invalid.' };
    const stat = await fs.promises.stat(realFull);
    if (!stat.isFile()) return { ok: false, code: 'invalid', error: 'Fișier invalid.' };
    if (stat.size > MAX_PDF_BYTES) return { ok: false, code: 'too-large', error: 'Fișierul PDF este prea mare pentru a fi afișat în aplicație.' };
    const buffer = await fs.promises.readFile(realFull);
    return { ok: true, data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) };
  } catch {
    return { ok: false, code: 'missing', error: 'Fișierul nu a putut fi citit. Verifică dacă folderul e încă acolo (Drive conectat?).' };
  }
}

const LIST_MAX_FILES = 5000;
const LIST_MAX_DEPTH = 8;

/**
 * Lists the PDFs under `<root>/<sub>` (default "Capitole") for the AI library sync: relative path (with "/"),
 * size and modified time. Symlinks and anything that would leave the root are skipped; hidden entries too.
 */
async function listPdfsInsideRoot(root, sub = 'Capitole') {
  if (typeof root !== 'string' || !root || typeof sub !== 'string' || !sub) return { ok: false, code: 'invalid', error: 'Folder invalid.' };
  const base = path.resolve(root);
  const start = path.resolve(base, sub);
  if (start !== base && !start.startsWith(base + path.sep)) return { ok: false, code: 'invalid', error: 'Folder invalid.' };
  const files = [];
  let truncated = false;
  async function walk(dir, depth) {
    if (depth > LIST_MAX_DEPTH || truncated) return;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'ro', { numeric: true }));
    for (const entry of entries) {
      if (truncated) return;
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf') {
        if (files.length >= LIST_MAX_FILES) { truncated = true; return; }
        try {
          const stat = await fs.promises.stat(full);
          files.push({ relPath: path.relative(base, full).split(path.sep).join('/'), size: stat.size, mtimeMs: Math.round(stat.mtimeMs) });
        } catch {
          // unreadable entry: skip
        }
      }
    }
  }
  try {
    const stat = await fs.promises.stat(start);
    if (!stat.isDirectory()) return { ok: false, code: 'missing', error: `Nu găsesc folderul „${sub}” în folderul ales.` };
  } catch {
    return { ok: false, code: 'missing', error: `Nu găsesc folderul „${sub}” în folderul ales. Verifică dacă folderul e încă acolo (Drive conectat?).` };
  }
  await walk(start, 0);
  return { ok: true, files, truncated };
}

/**
 * Folderul cu materialele, pe profil, într-un fișier din folderul de date al aplicației. În pagină se ține doar în
 * localStorage, care e separat pe origine (`localhost` în dezvoltare, `file://` în aplicația instalată): fără asta, aplicația
 * instalată și `start.bat` ajungeau cu foldere diferite.
 */
function rootsFile(userDataDir) {
  return path.join(userDataDir, 'organizare-roots.json');
}

function readRoots(userDataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(rootsFile(userDataDir), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeRoots(userDataDir, roots) {
  const file = rootsFile(userDataDir);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(roots, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** Rădăcina-sentinelă pentru cărțile livrate cu aplicația (resources/books în installer, build/books în dezvoltare). */
const BUNDLED_ROOT = 'studyx:bundled';

/** `studyx:bundled` → folderul real al cărților incluse; orice altă rădăcină rămâne neschimbată. */
function realRoot(root, bundledBooksDir) {
  return root === BUNDLED_ROOT ? bundledBooksDir : root;
}

function registerOrganizareIPC({ ipcMain, dialog, shell, getWindow, userDataDir, bundledBooksDir }) {
  ipcMain.handle('organizare:list-pdfs', async (_, payload) => listPdfsInsideRoot(payload && payload.root, payload && payload.sub));
  ipcMain.handle('organizare:pickRoot', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Alege folderul cu materialele de studiu (cel care conține Capitole și Carti)',
      properties: ['openDirectory'],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle('organizare:open', async (_, { root, relPath }) => {
    const full = resolveInsideRoot(realRoot(root, bundledBooksDir), relPath);
    if (!full) return { ok: false, error: 'Fișier invalid.' };
    // openPath resolves to '' on success and to an error message otherwise (e.g. the file is missing).
    const error = await shell.openPath(full);
    return error ? { ok: false, error: 'Fișierul nu a putut fi deschis. Verifică dacă folderul e încă acolo (Drive conectat?).' } : { ok: true };
  });

  // Alegerea utilizatorului poate fi un subfolder, părintele sau un vecin: întoarce folderul care conține Carti/Capitole.
  ipcMain.handle('organizare:resolve-root', async (_, payload) => findMaterialsRoot(payload && payload.root, payload && payload.expected));
  // Caută singur folderul cu materialele în locurile obișnuite (Desktop, Documente, Descărcări, Drive…).
  ipcMain.handle('organizare:detect-root', async (_, payload) => detectMaterialsRoot(commonBases(os.homedir()), payload && payload.expected));

  ipcMain.handle('organizare:root-get', async (_, payload) => {
    const id = payload && payload.profileId;
    if (!userDataDir || !isSafeStorageId(id)) return null;
    const value = readRoots(userDataDir)[id];
    return typeof value === 'string' && value ? value : null;
  });
  ipcMain.handle('organizare:root-set', async (_, payload) => {
    const id = payload && payload.profileId;
    const value = payload && payload.root;
    if (!userDataDir || !isSafeStorageId(id) || !(value === null || (typeof value === 'string' && path.isAbsolute(value)))) return false;
    try {
      const roots = readRoots(userDataDir);
      if (value) roots[id] = value;
      else delete roots[id];
      writeRoots(userDataDir, roots);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('organizare:read-pdf', async (_, payload) => readPdfInsideRoot(realRoot(payload && payload.root, bundledBooksDir), payload && payload.relPath));
}

module.exports = { BUNDLED_ROOT, realRoot, resolveInsideRoot, resolvePdfInsideRoot, readPdfInsideRoot, listPdfsInsideRoot, readRoots, writeRoots, MAX_PDF_BYTES, registerOrganizareIPC };
