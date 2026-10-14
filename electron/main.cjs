console.log('[StudyX] Main process starting...');
const { app, BrowserWindow, ipcMain, shell, dialog, Notification, Tray, nativeImage, Menu, session, screen, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const { fork } = require('child_process');
const { registerUpdaterIPC } = require('./updater.cjs');
const { registerOrganizareIPC } = require('./organizare.cjs');
const { compareVersion } = require('./lib/versions.cjs');
const { shouldClearStorageOnFirstRun, inspectUserData } = require('./lib/firstRun.cjs');
const { isSafeStorageId } = require('./lib/validate.cjs');
const {
  getAdaptiveWindowMetrics: getAdaptiveMetricsFromHelper,
  clampBoundsToDisplay: clampBoundsHelper,
  readWindowState: readWindowStateHelper,
  persistWindowState: persistWindowStateHelper,
  ensureWindowFitsDisplay: ensureWindowFitsDisplayHelper,
} = require('./lib/windowState.cjs');

// Must be called before any other app.* API — Windows reads AUMID at startup
// to associate the process with the correct taskbar button and icon.
// În dezvoltare folosim un AUMID separat: Windows ține în cache iconița asociată unui AUMID (și a unui eventual shortcut fixat),
// iar fără asta bara de jos poate arăta iconița implicită Electron în loc de cea a aplicației.
const APP_USER_MODEL_ID = app.isPackaged ? 'com.studyx.app' : 'com.studyx.app.dev';
app.setAppUserModelId(APP_USER_MODEL_ID);
app.setName('StudyX');

const isDev = !app.isPackaged;
// Adresa serverului de dezvoltare; STUDYX_DEV_URL permite teste pe alt port fără să atingă 5173 (al lui electron:dev).
const DEV_URL = process.env.STUDYX_DEV_URL || 'http://localhost:5173';
// STUDYX_USER_DATA (cale absolută) mută userData într-un director de test; fără ea rămâne %APPDATA%\StudyX.
const userDataOverride = path.isAbsolute(process.env.STUDYX_USER_DATA || '') ? process.env.STUDYX_USER_DATA : null;
const sharedUserDataPath = userDataOverride || path.join(app.getPath('appData'), 'StudyX');
const legacyDevUserDataPath = path.join(app.getPath('appData'), 'StudyX-Dev');

app.setPath('userData', sharedUserDataPath);

// 1. Dev vs Prod userData isolation
let mainWindow = null;

// ── Window background follows the app theme ────────────────────────────────
// The renderer reports its background on every theme change (theme:set); we keep
// the last one on disk so the next launch opens in the right colour instead of
// flashing the wrong one until the page paints.
const DARK_WINDOW_BG = '#0B0B0E';
const LIGHT_WINDOW_BG = '#F5F5F7';

function windowBackgroundFile() {
  return path.join(app.getPath('userData'), 'window-background.json');
}

function loadWindowBackground() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowBackgroundFile(), 'utf8'));
    if (saved && /^#[0-9a-fA-F]{6}$/.test(saved.background || '')) return saved.background;
  } catch {
    // first launch or unreadable file — follow the system
  }
  return nativeTheme.shouldUseDarkColors ? DARK_WINDOW_BG : LIGHT_WINDOW_BG;
}

function saveWindowBackground(background) {
  try {
    fs.writeFileSync(windowBackgroundFile(), JSON.stringify({ background }), 'utf8');
  } catch (err) {
    console.warn('[Theme] Could not persist window background:', err?.message);
  }
}
let tray = null;
let isQuitting = false;
let pendingQuitResolve = null;
const QUIT_SAVE_TIMEOUT_MS = 8000;

/**
 * Cere renderer-ului să salveze (app:request-close) și așteaptă confirmarea (win:destroy) cel mult
 * QUIT_SAVE_TIMEOUT_MS; apoi setează isQuitting=true și continuă oricum (renderer blocat nu oprește update-ul).
 */
function prepareForQuit() {
  if (isQuitting) return Promise.resolve();
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    isQuitting = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let timer = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      pendingQuitResolve = null;
      isQuitting = true;
      resolve();
    };
    pendingQuitResolve = finish;
    timer = setTimeout(finish, QUIT_SAVE_TIMEOUT_MS);
    try {
      mainWindow.webContents.send('app:request-close');
    } catch {
      finish();
    }
  });
}
let saveWindowStateTimer = null;
let backgroundTasksStarted = false;
async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getDirectorySize(targetPath) {
  if (!(await pathExists(targetPath))) return 0;
  const entries = await fsp.readdir(targetPath, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) total += await getDirectorySize(fullPath);
    else {
      try {
        const stat = await fsp.stat(fullPath);
        total += stat.size;
      } catch (error) {
        // Silently ignore file stat errors in directory size calculation
        console.debug('[StudyX] File stat error during directory size calculation:', error.message);
      }
    }
  }
  return total;
}

async function profileDataScore(baseDir) {
  const profilesDir = path.join(baseDir, 'profiles');
  if (!(await pathExists(profilesDir))) return 0;
  const entries = await fsp.readdir(profilesDir, { withFileTypes: true });
  const profileDirs = entries.filter((entry) => entry.isDirectory()).length;
  const profileBytes = await getDirectorySize(profilesDir);
  return profileDirs * 1000000 + profileBytes;
}

async function copyRecursive(sourceDir, targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyRecursive(sourcePath, targetPath);
    } else {
      await fsp.copyFile(sourcePath, targetPath);
    }
  }
}

function getLegacyMigrationMarkerPath() {
  return path.join(app.getPath('userData'), '.legacy-dev-migration.json');
}

function getHardResetMarkerPath() {
  return path.join(app.getPath('userData'), '.hard-reset-pending.json');
}

async function writeLegacyMigrationMarker(status) {
  try {
    await fsp.mkdir(app.getPath('userData'), { recursive: true });
    await fsp.writeFile(
      getLegacyMigrationMarkerPath(),
      JSON.stringify({ status, checkedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.warn('[StudyX] Failed to persist legacy migration marker:', err);
  }
}

async function writeHardResetMarker() {
  await fsp.mkdir(app.getPath('userData'), { recursive: true });
  await fsp.writeFile(
    getHardResetMarkerPath(),
    JSON.stringify({ requestedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );
}

async function removeUserDataEntriesForHardReset() {
  const userDataPath = app.getPath('userData');
  const markerName = path.basename(getHardResetMarkerPath());
  const keepEntries = new Set(['settings.json', markerName]);
  const entries = await fsp.readdir(userDataPath).catch(() => []);
  let removed = 0;
  let locked = 0;

  for (const entry of entries) {
    if (keepEntries.has(entry)) continue;
    const fullPath = path.join(userDataPath, entry);
    try {
      await fsp.rm(fullPath, { recursive: true, force: true, maxRetries: 4, retryDelay: 160 });
      removed += 1;
    } catch (error) {
      if (['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) {
        locked += 1;
      } else {
        console.warn('[StudyX] Hard reset cleanup skipped entry:', entry, error?.message || String(error));
      }
    }
  }

  return { removed, locked };
}

async function runPendingHardResetCleanup() {
  if (!(await pathExists(getHardResetMarkerPath()))) return;

  const result = await removeUserDataEntriesForHardReset();
  await writeLegacyMigrationMarker('skipped-after-hard-reset');
  await fsp.rm(getHardResetMarkerPath(), { force: true }).catch(() => undefined);

  if (result.locked > 0) {
    console.warn(`[StudyX] Hard reset cleaned ${result.removed} entries; ${result.locked} Chromium files were still locked and will be ignored.`);
  } else {
    console.log(`[StudyX] Hard reset cleanup completed (${result.removed} entries removed).`);
  }
}

async function migrateLegacyUserData() {
  if (userDataOverride) return; // director de test: nu atinge StudyX-Dev / datele reale
  if (await pathExists(getLegacyMigrationMarkerPath())) return;
  if (!(await pathExists(legacyDevUserDataPath))) {
    await writeLegacyMigrationMarker('no-legacy');
    return;
  }

  const currentScore = await profileDataScore(sharedUserDataPath);
  const legacyScore = await profileDataScore(legacyDevUserDataPath);
  if (legacyScore <= currentScore) {
    await writeLegacyMigrationMarker('current-newer');
    return;
  }

  const importantEntries = [
    '.first-run',
    'Local Storage',
    'Session Storage',
    'WebStorage',
    'IndexedDB',
    'profiles',
    'Preferences',
    'Local State',
    'settings.json',
    'last-notified.txt',
  ];

  await fsp.mkdir(sharedUserDataPath, { recursive: true });
  for (const entry of importantEntries) {
    const sourcePath = path.join(legacyDevUserDataPath, entry);
    const targetPath = path.join(sharedUserDataPath, entry);
    if (!(await pathExists(sourcePath))) continue;

    if (await pathExists(targetPath)) {
      try {
        const stat = await fsp.stat(targetPath);
        if (stat.isDirectory()) await fsp.rm(targetPath, { recursive: true, force: true });
        else await fsp.unlink(targetPath);
      } catch (error) {
        console.warn('[StudyX] Failed to remove file during cleanup:', targetPath, error.message);
      }
    }

    const sourceStat = await fsp.stat(sourcePath);
    if (sourceStat.isDirectory()) await copyRecursive(sourcePath, targetPath);
    else await fsp.copyFile(sourcePath, targetPath);
  }

  console.log('[StudyX] Migrated richer data set from legacy StudyX-Dev storage.');
  await writeLegacyMigrationMarker('migrated');
}

async function writeJsonAtomically(filePath, serialized) {
  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, serialized, 'utf-8');
  await fsp.rename(tempPath, filePath);
}

async function markCorruptFile(filePath) {
  try {
    const corruptPath = `${filePath}.corrupt-${Date.now()}`;
    await fsp.rename(filePath, corruptPath);
    console.warn(`[Storage] Marked corrupt file: ${corruptPath}`);
  } catch (err) {
    console.error('[Storage] Failed to mark corrupt file:', err);
  }
}

function getAppIconPath() {
  const exeDir = path.dirname(app.getPath('exe'));
  const candidates = [
    // Packaged: asarUnpack path via process.resourcesPath
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'public', 'icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'public', 'icon.png'),
    // Packaged: exe-relative path (more portable)
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'public', 'icon.ico'),
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'public', 'icon.png'),
    // Packaged: resources root
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    // Dev: project public folder
    path.join(__dirname, '../public/icon.ico'),
    path.join(__dirname, '../public/icon.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined;
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function sanitizeProfileId(profileId) {
  return String(profileId || '').replace(/[^a-z0-9_-]/gi, '_');
}

function getProfileNamespacePath(profileId, namespace) {
  return path.join(app.getPath('userData'), 'profiles', sanitizeProfileId(profileId), `${namespace}.json`);
}

async function readJsonFileSafe(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readDiskLastStudyDate(profileId) {
  if (!profileId) return '';
  const stats = await readJsonFileSafe(getProfileNamespacePath(profileId, 'stats'));
  return stats?.streak?.lastStudyDate ?? '';
}

function initializeTray() {
  if (tray) return;
  try {
    const trayIcon = nativeImage.createFromPath(getAppIconPath() || '').resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Deschide StudyX', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: '\u00CEnchide', click: () => app.quit() },
    ]));
    tray.on('click', () => mainWindow?.show());
  } catch (error) {
    console.warn('[StudyX] Failed to create system tray:', error.message);
  }
}

function scheduleBackgroundTasks() {
  if (backgroundTasksStarted) return;
  backgroundTasksStarted = true;
  setTimeout(() => scheduleDailyReminder(), 1200);
  setTimeout(() => initializeTray(), 1800);
}

function readStartupSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function getAdaptiveWindowMetrics() {
  return getAdaptiveMetricsFromHelper(screen);
}

function clampBoundsToDisplay(bounds) {
  return clampBoundsHelper(bounds, screen);
}

function readWindowState() {
  return readWindowStateHelper(getWindowStatePath(), screen);
}

function getBundledVersion() {
  try {
    return app.getVersion?.() || '1.0.0';
  } catch {
    try {
      const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }
}

/**
 * Drops Chromium's compiled-code cache when the app version changes.
 *
 * The renderer bundle uses fixed filenames (no content hashes) so update
 * patches stay predictable — which means an update replaces the *contents* of
 * URLs like `dist/assets/FolderView.js` while the URL stays identical. V8 then
 * serves bytecode it compiled from the PREVIOUS build for that URL, the module
 * fails to instantiate, and the renderer dies with "Failed to fetch dynamically
 * imported module" (observed on the 1.0.7 -> 1.0.8 update).
 */
async function clearCodeCacheOnVersionChange() {
  const markerPath = path.join(app.getPath('userData'), 'last-run-version.json');
  const version = getBundledVersion();

  let previous = null;
  try {
    previous = JSON.parse(await fsp.readFile(markerPath, 'utf-8'))?.version ?? null;
  } catch { /* first run, or unreadable marker — treat as a version change */ }

  if (previous !== version) {
    try {
      await session.defaultSession.clearCodeCaches({ urls: [] });
      console.log(`[StudyX] Cleared code cache after version change (${previous ?? 'necunoscut'} -> ${version}).`);
    } catch (error) {
      console.warn('[StudyX] Failed to clear code cache:', error.message);
    }
  }

  try {
    await fsp.writeFile(markerPath, JSON.stringify({ version, at: new Date().toISOString() }), 'utf-8');
  } catch (error) {
    console.warn('[StudyX] Failed to record run version:', error.message);
  }
}

function getOverlayRoot() {
  return path.join(app.getPath('userData'), 'app-overlay');
}

function readOverlayManifest() {
  const overlayManifestPath = path.join(getOverlayRoot(), 'manifest.json');
  if (!fs.existsSync(overlayManifestPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(overlayManifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

function getPreferredRendererEntry() {
  const bundledHtml = path.join(__dirname, '../dist/index.html');
  const overlayRoot = getOverlayRoot();
  const overlayHtml = path.join(overlayRoot, 'files', 'dist', 'index.html');
  const manifest = readOverlayManifest();

  if (!fs.existsSync(overlayHtml) || !manifest) {
    return bundledHtml;
  }

  const overlayVersion = manifest?.version;
  const bundledVersion = getBundledVersion();
  if (!overlayVersion || compareVersion(overlayVersion, bundledVersion) <= 0) {
    return bundledHtml;
  }

  return overlayHtml;
}

async function pruneStaleOverlay() {
  const manifest = readOverlayManifest();
  if (!manifest?.version) return;

  const bundledVersion = getBundledVersion();
  if (compareVersion(manifest.version, bundledVersion) > 0) return;

  const overlayRoot = getOverlayRoot();
  try {
    await fsp.rm(overlayRoot, { recursive: true, force: true });
    console.log(`[StudyX] Removed stale overlay ${manifest.version}; bundled app is ${bundledVersion}.`);
  } catch (err) {
    console.warn('[StudyX] Failed to remove stale overlay:', err);
  }
}

function persistWindowState(win) {
  persistWindowStateHelper(win, getWindowStatePath(), screen);
}

function scheduleWindowStateSave(win) {
  if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer);
  saveWindowStateTimer = setTimeout(() => persistWindowState(win), 180);
}

function ensureWindowFitsDisplay(win) {
  ensureWindowFitsDisplayHelper(win, screen);
}

const startupSettings = readStartupSettings();
if (startupSettings.hardwareAccel === false) {
  app.disableHardwareAcceleration();
  console.log('[StudyX] Hardware acceleration disabled by saved setting.');
}

// Helper Functions

const PDF_JOB_TIMEOUT_MS = 12000;

/**
 * A flat 12s budget silently truncated residency textbooks: Kumar (391 pages,
 * ~71 MB) needs ~11s of pure parsing on a fast machine, so any loaded laptop
 * blew the deadline and the whole book was thrown away. The budget now scales
 * with the file, and partial text is kept when the deadline is still hit.
 */
const PDF_TIMEOUT_PER_MB_MS = 1500;
const PDF_TIMEOUT_MAX_MS = 300000;
/** Below this a salvaged partial extraction isn't worth handing to the indexer. */
const PDF_PARTIAL_MIN_CHARS = 2000;

function pdfTimeoutForBytes(byteLength) {
  if (!byteLength) return PDF_JOB_TIMEOUT_MS;
  const megabytes = byteLength / (1024 * 1024);
  return Math.min(PDF_TIMEOUT_MAX_MS, PDF_JOB_TIMEOUT_MS + Math.ceil(megabytes * PDF_TIMEOUT_PER_MB_MS));
}

let pdfQueue = Promise.resolve();

function queuePdfJob(task) {
  const job = pdfQueue.then(task, task);
  pdfQueue = job.then(() => undefined, () => undefined);
  return job;
}

function runPdfWorker(payload, timeoutMs = PDF_JOB_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const workerPath = path.join(__dirname, 'pdf-worker.cjs');
    const child = fork(workerPath, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let settled = false;
    /** Batches streamed by the worker, kept so a crash or timeout doesn't lose read pages. */
    const streamedParts = [];
    let lastProgress = null;

    /** Whatever pages were already streamed, if that is worth indexing at all. */
    const salvagePartial = () => {
      const partial = streamedParts.join('\n');
      return partial.length >= PDF_PARTIAL_MIN_CHARS ? partial : null;
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.removeAllListeners('message');
      child.removeAllListeners('error');
      child.removeAllListeners('exit');
      try {
        if (child.connected) child.disconnect();
      } catch (error) {
        console.warn('[StudyX] Failed to disconnect PDF worker:', error.message);
      }
      resolve(typeof result === 'string' && result.trim().length > 0 ? result : null);
    };

    const timeout = setTimeout(() => {
      const salvaged = salvagePartial();
      console.warn(
        salvaged
          ? `[PDF] Worker timed out at page ${lastProgress?.page ?? '?'}/${lastProgress?.total ?? '?'}; keeping ${salvaged.length} extracted characters.`
          : '[PDF] Worker timed out and will be terminated.',
      );
      try {
        child.kill();
      } catch (error) {
        console.warn('[StudyX] Failed to kill PDF worker timeout:', error.message);
      }
      finish(salvaged);
    }, timeoutMs);

    child.on('message', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'chunk') {
        if (typeof message.text === 'string' && message.text.length > 0) {
          streamedParts.push(message.text);
        }
        lastProgress = { page: message.page, total: message.total };
        return;
      }
      if (message.type === 'result') {
        finish(message.text ?? null);
        return;
      }
      if (message.type === 'log') {
        console.warn(message.message);
        return;
      }
      if (message.type === 'error') {
        console.error('[PDF] Worker failed:', message.message);
        finish(salvagePartial());
      }
    });

    child.on('error', (error) => {
      console.error('[PDF] Worker process error:', error);
      finish(salvagePartial());
    });

    child.on('exit', (code, signal) => {
      if (!settled && code !== 0) {
        console.warn(`[PDF] Worker exited unexpectedly (code=${code}, signal=${signal}).`);
      }
      finish(salvagePartial());
    });

    try {
      child.send(payload);
    } catch (error) {
      console.error('[PDF] Failed to start worker job:', error);
      try {
        child.kill();
      } catch (killError) {
        console.warn('[StudyX] Failed to kill PDF worker on error:', killError.message);
      }
      finish(null);
    }
  });
}

const extractPdfText = async (filePath) => {
  return queuePdfJob(async () => {
    try {
      const { size } = await fsp.stat(filePath);
      return await runPdfWorker({ filePath }, pdfTimeoutForBytes(size));
    } catch {
      return null;
    }
  });
};

const extractPdfTextFromBuffer = async (buffer) => {
  if (!buffer || buffer.length === 0) return null;
  return queuePdfJob(() => runPdfWorker(
    { bufferBase64: buffer.toString('base64') },
    pdfTimeoutForBytes(buffer.length),
  ));
};

const extractDocxText = async (filePath) => {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.trim();
  } catch (e) {
    console.error('Error extracting docx:', e);
    return null;
  }
};

let ocrWorkerPromise = null;
let ocrQueue = Promise.resolve();

async function getOCRWorker() {
  if (!ocrWorkerPromise) {
    const { createWorker } = require('tesseract.js');
    ocrWorkerPromise = createWorker('ron');
  }
  return ocrWorkerPromise;
}

async function runOCRJob(filePath) {
  const worker = await getOCRWorker();
  const result = await worker.recognize(filePath);
  return result?.data?.text?.trim() || null;
}

const extractOCRText = async (filePath) => {
  const job = ocrQueue.then(async () => {
    try {
      return await runOCRJob(filePath);
    } catch (e) {
      console.error('OCR Error:', e);
      return null;
    }
  });

  ocrQueue = job.then(() => undefined, () => undefined);
  return job;
};

// IPC Handlers Registration

function registerIpcHandlers() {
  // Window controls
  // Theme sync (renderer -> main): keep the native window colour and nativeTheme in step with the app.
  ipcMain.on('theme:set', (_event, payload) => {
    const mode = payload && ['light', 'dark', 'auto'].includes(payload.mode) ? payload.mode : 'auto';
    const background = payload && /^#[0-9a-fA-F]{6}$/.test(payload.background || '') ? payload.background : null;
    nativeTheme.themeSource = mode === 'auto' ? 'system' : mode;
    if (background) {
      mainWindow?.setBackgroundColor(background);
      saveWindowBackground(background);
    }
  });
  ipcMain.on('win:minimize', () => mainWindow?.minimize());
  ipcMain.on('win:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  
  // Custom close button click
  ipcMain.on('win:close', () => {
    mainWindow?.close();
  });

  // Final exit after data is saved
  ipcMain.on('win:destroy', () => {
    isQuitting = true;
    if (pendingQuitResolve) {
      // Închiderea e condusă de prepareForQuit (update/tray): doar semnalăm că salvarea s-a terminat.
      const resolve = pendingQuitResolve;
      pendingQuitResolve = null;
      resolve();
      return;
    }
    mainWindow?.close();
  });

  ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false);

  // Cărțile de Rezidențiat livrate cu aplicația (Kumar, Lawrence, Sinopsis): extraResources/books în installer, build/books în dezvoltare.
  const bundledBooksDir = app.isPackaged ? path.join(process.resourcesPath, 'books') : path.join(__dirname, '..', 'build', 'books');
  registerOrganizareIPC({ ipcMain, dialog, shell, getWindow: () => mainWindow, userDataDir: app.getPath('userData'), bundledBooksDir });

  // File import IPCs
  ipcMain.handle('dialog:openJson', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    if (result.canceled) return null;
    const contents = await Promise.all(result.filePaths.map(async (p) => ({
      name: path.basename(p),
      content: await fsp.readFile(p, 'utf-8'),
    })));
    return contents;
  });

  ipcMain.handle('dialog:saveFile', async (_, { defaultPath, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fsp.writeFile(result.filePath, content, 'utf-8');
    return true;
  });

  ipcMain.handle('dialog:openPdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return extractPdfText(result.filePaths[0]);
  });

  ipcMain.handle('pdf:readPath', async (_, filePath) => {
    if (!filePath || !filePath.toLowerCase().endsWith('.pdf')) return null;
    try {
      await fsp.access(filePath);
      return extractPdfText(filePath);
    } catch { return null; }
  });

  ipcMain.handle('pdf:readBuffer', async (_, bufferLike) => {
    try {
      const buffer = Buffer.isBuffer(bufferLike)
        ? bufferLike
        : bufferLike instanceof Uint8Array
          ? Buffer.from(bufferLike)
          : bufferLike instanceof ArrayBuffer
            ? Buffer.from(bufferLike)
            : Array.isArray(bufferLike)
              ? Buffer.from(bufferLike)
              : null;
      if (!buffer || buffer.length === 0) return null;

      return await extractPdfTextFromBuffer(buffer);
    } catch (err) {
      console.error('[PDF] Invalid buffer payload:', err);
      return null;
    }
  });

  ipcMain.handle('dialog:openDocx', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Word Documents', extensions: ['docx'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return extractDocxText(result.filePaths[0]);
  });

  ipcMain.handle('docx:readPath', async (_, filePath) => {
    if (!filePath || !filePath.toLowerCase().endsWith('.docx')) return null;
    try {
      await fsp.access(filePath);
      return extractDocxText(filePath);
    } catch { return null; }
  });

  ipcMain.handle('image:readOCR', async (_, filePath) => {
    const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
    const ext = path.extname(filePath).toLowerCase();
    if (!filePath || !validExts.includes(ext)) return null;
    try {
      await fsp.access(filePath);
      return extractOCRText(filePath);
    } catch { return null; }
  });

  // Base64 image import
  ipcMain.handle('dialog:openImage', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
    const mime = mimeMap[ext] || 'image/jpeg';
    const buffer = await fsp.readFile(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  });

  // Settings & System
  ipcMain.handle('win:setContentProtection', (_, enabled) => {
    mainWindow?.setContentProtection(enabled);
    return true;
  });

  ipcMain.handle('notify:show', async (_, opts) => {
    try {
      if (!Notification.isSupported()) return false;
      const title = typeof opts?.title === 'string' ? opts.title : 'StudyX';
      const body = typeof opts?.body === 'string' ? opts.body : '';
      const notification = new Notification({ title, body, silent: false });
      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
      notification.show();
      return true;
    } catch (error) {
      console.warn('[StudyX] notify:show failed:', error.message);
      return false;
    }
  });

  ipcMain.handle('app:hardReset', async () => {
    let markerWritten = false;
    try {
      await writeHardResetMarker();
      markerWritten = true;
      await session.defaultSession.clearStorageData();
    } catch (error) {
      console.warn('[StudyX] Hard reset error:', error?.message || String(error));
      if (!markerWritten) {
        // Marker not written — do the cleanup inline so the reset actually takes effect.
        try {
          await removeUserDataEntriesForHardReset();
        } catch (cleanupErr) {
          console.warn('[StudyX] Hard reset inline cleanup failed:', cleanupErr?.message || String(cleanupErr));
        }
      }
    }
    app.relaunch();
    isQuitting = true;
    app.quit();
    return true;
  });

  ipcMain.handle('dialog:saveCsv', async (_, { defaultPath, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fsp.writeFile(result.filePath, content, 'utf-8');
    return true;
  });

  ipcMain.handle('app:autoBackup', async (_, { data }) => {
    try {
      // Test profiles must never rotate or overwrite the user's real backups.
      const backupDir = userDataOverride
        ? path.join(userDataOverride, 'backups')
        : path.join(app.getPath('documents'), 'StudyX-Backups');
      await fsp.mkdir(backupDir, { recursive: true });
      const files = await fsp.readdir(backupDir);
      const existing = files.filter(f => f.startsWith('studyx-backup-')).sort();
      while (existing.length >= 10) {
        const toDelete = existing.shift();
        if (toDelete) await fsp.unlink(path.join(backupDir, toDelete));
      }
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filePath = path.join(backupDir, `studyx-backup-${dateStr}.json`);
      await fsp.writeFile(filePath, data, 'utf-8');
      return { success: true, path: filePath };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Persistent Disk Storage for Profiles (Fixes 5MB LocalStorage limit)
  ipcMain.handle('storage:save', async (_, { profileId, namespace, serialized } = {}) => {
    try {
      if (typeof serialized !== 'string') throw new Error('Invalid storage payload');
      if (!isSafeStorageId(profileId) || !isSafeStorageId(namespace)) throw new Error('Invalid storage id');
      const safeId = profileId.replace(/[^a-z0-9_-]/gi, '_');
      const safeNs = namespace.replace(/[^a-z0-9_-]/gi, '_');
      // Increased limit to 500MB for large image-heavy quiz sets
      if (serialized.length > 500 * 1024 * 1024) throw new Error('Data too large (>500MB)');
      const storageDir = path.join(app.getPath('userData'), 'profiles', safeId);
      await fsp.mkdir(storageDir, { recursive: true });
      const filePath = path.join(storageDir, `${safeNs}.json`);
      await writeJsonAtomically(filePath, serialized);
      return true;
    } catch (err) {
      console.error('[Storage] Save error:', err);
      return false;
    }
  });

  // Deleting a profile removes its disk folder (userData/profiles/<safeId>) and nothing else.
  ipcMain.handle('storage:delete-profile', async (_, { profileId } = {}) => {
    try {
      if (!isSafeStorageId(profileId)) return false;
      const safeId = profileId.replace(/[^a-z0-9_-]/gi, '_');
      const profilesRoot = path.join(app.getPath('userData'), 'profiles');
      const target = path.join(profilesRoot, safeId);
      // Same sanitising as storage:save, so the folder is always a direct child of profiles/.
      if (path.dirname(target) !== profilesRoot) return false;
      await fsp.rm(target, { recursive: true, force: true });
      return true;
    } catch (err) {
      console.error('[Storage] Delete profile error:', err);
      return false;
    }
  });

  ipcMain.handle('storage:load', async (_, { profileId, namespace } = {}) => {
    try {
      if (!isSafeStorageId(profileId) || !isSafeStorageId(namespace)) return null;
      const safeId = profileId.replace(/[^a-z0-9_-]/gi, '_');
      const safeNs = namespace.replace(/[^a-z0-9_-]/gi, '_');
      const filePath = path.join(app.getPath('userData'), 'profiles', safeId, `${safeNs}.json`);
      try {
        const data = await fsp.readFile(filePath, 'utf-8');
        return JSON.parse(data);
      } catch (err) {
        if (err instanceof SyntaxError) {
          await markCorruptFile(filePath);
          return { __corrupt: true, __namespace: safeNs };
        }
        // Fișier inexistent = profil/namespace nou. Orice altă eroare (EBUSY, EACCES, EIO...) NU e „fără date": o propagăm,
        // ca renderer-ul să blocheze scrierea în loc să pornească gol și să suprascrie datele bune de pe disc.
        if (err && err.code === 'ENOENT') return null;
        throw err;
      }
    } catch (err) {
      console.error('[Storage] Load error:', err);
      throw err;
    }
  });

  ipcMain.once('app:ready', () => mainWindow?.show());
}

// Main Functions

function createWindow() {
  const iconPath = getAppIconPath();
  const adaptiveMetrics = getAdaptiveWindowMetrics();
  const savedBounds = readWindowState();
  const initialBounds = savedBounds ?? {
    x: adaptiveMetrics.x,
    y: adaptiveMetrics.y,
    width: adaptiveMetrics.width,
    height: adaptiveMetrics.height,
  };

  // Creăm nativeImage ÎNAINTE de BrowserWindow — Windows citește icon-ul din constructor
  let appIcon = null;
  if (iconPath) {
    try {
      appIcon = nativeImage.createFromPath(iconPath);
      if (appIcon.isEmpty()) appIcon = null;
    } catch (e) { appIcon = null; }
  }

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    backgroundColor: loadWindowBackground(),
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      spellcheck: false,
    },
    // Folosim nativeImage (nu string) — mai fiabil pe Windows pentru taskbar
    icon: appIcon || iconPath || undefined,
    show: false,
  });

  // Windows: leagă explicit butonul din bara de jos de iconița aplicației (altfel poate rămâne atomul Electron,
  // mai ales când aplicația rulează din electron.exe, adică în dezvoltare).
  if (process.platform === 'win32' && iconPath && iconPath.toLowerCase().endsWith('.ico')) {
    try {
      mainWindow.setAppDetails({
        appId: APP_USER_MODEL_ID,
        appIconPath: iconPath,
        appIconIndex: 0,
        relaunchDisplayName: 'StudyX',
      });
    } catch { /* ignore */ }
  }

  // Setăm din nou icon-ul după creare pentru a forța actualizarea taskbar-ului
  if (appIcon) {
    try {
      mainWindow.setIcon(appIcon);
    } catch (e) { /* ignore */ }
  }

  // Links must never open inside the app. Without this, a middle-click (or any
  // target="_blank" link, including ones inside AI answers) spawned a bare
  // Electron window with the page loaded in it — no address bar, no way back.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((error) => {
        console.warn('[StudyX] Failed to open external link:', error.message);
      });
    }
    return { action: 'deny' };
  });

  // Same protection for the main frame: a link must not navigate the app away
  // from its own UI. Anything external is handed to the system browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    if (url === current) return;
    const isAppUrl = url.startsWith('file://') || (isDev && url.startsWith(DEV_URL));
    if (isAppUrl) return;

    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((error) => {
        console.warn('[StudyX] Failed to open external link:', error.message);
      });
    }
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    if (!userDataOverride) mainWindow.webContents.openDevTools({ mode: 'detach' });
    // Event-object form (the positional-arguments form is deprecated in Electron 35+).
    mainWindow.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') {
        console.error(`[Renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
      }
    });
    setTimeout(() => { if (mainWindow && !mainWindow.isVisible()) mainWindow.show(); }, 3000);
  } else {
    const loadPath = getPreferredRendererEntry();
    mainWindow.loadFile(loadPath);

    // Safety net: if the renderer dies anyway (stale code cache, corrupt cache
    // entry), wipe the caches and reload once instead of leaving the user on a
    // dead window they can only fix by reinstalling.
    let recovered = false;
    mainWindow.webContents.on('render-process-gone', async (_event, details) => {
      if (recovered || details?.reason === 'clean-exit') return;
      recovered = true;
      console.error(`[StudyX] Renderer gone (${details?.reason}); clearing caches and reloading.`);
      try {
        await session.defaultSession.clearCodeCaches({ urls: [] });
        await session.defaultSession.clearCache();
      } catch (error) {
        console.warn('[StudyX] Cache clear after renderer crash failed:', error.message);
      }
      try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
      } catch (error) {
        console.warn('[StudyX] Reload after renderer crash failed:', error.message);
      }
    });
  }

  mainWindow.once('ready-to-show', () => {
    if (appIcon) {
      try { mainWindow?.setIcon(appIcon); } catch { /* ignore */ }
    }
    // Force Windows taskbar to pick up the correct icon and AUMID association.
    try { app.setAppUserModelId(APP_USER_MODEL_ID); } catch { /* ignore */ }
    if (savedBounds?.isMaximized || (!savedBounds && adaptiveMetrics.shouldMaximize)) {
      mainWindow?.maximize();
    }
  });

  // Re-apply icon after renderer finishes loading — Chromium can reset the
  // window icon when it initialises its own rendering pipeline on Windows.
  mainWindow.webContents.once('did-finish-load', () => {
    if (appIcon) {
      try { mainWindow?.setIcon(appIcon); } catch { /* ignore */ }
    }
    // Overlay icon = null clears any residual Electron default overlay on Windows.
    try { mainWindow?.setOverlayIcon(null, ''); } catch { /* ignore */ }
  });
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('win:maximized', true);
    scheduleWindowStateSave(mainWindow);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('win:maximized', false);
    scheduleWindowStateSave(mainWindow);
  });
  mainWindow.on('resize', () => scheduleWindowStateSave(mainWindow));
  mainWindow.on('move', () => scheduleWindowStateSave(mainWindow));
  mainWindow.on('blur', () => persistWindowState(mainWindow));
  
  // Handle window close: allow renderer to save state first
  mainWindow.on('close', (e) => {
    if (mainWindow && !isQuitting) {
      e.preventDefault();
      mainWindow.webContents.send('app:request-close');
    }
  });

  screen.on('display-metrics-changed', () => ensureWindowFitsDisplay(mainWindow));
  screen.on('display-added', () => ensureWindowFitsDisplay(mainWindow));
  screen.on('display-removed', () => ensureWindowFitsDisplay(mainWindow));

  registerUpdaterIPC(mainWindow, { prepareForQuit });
}

function scheduleDailyReminder() {
  if (!Notification.isSupported()) return;
  const checkAndNotify = async () => {
    const today = new Date().toISOString().split('T')[0];
    const stored = path.join(app.getPath('userData'), 'last-notified.txt');
    let lastNotified = '';
    try { 
      lastNotified = (await fsp.readFile(stored, 'utf-8')).trim(); 
    } catch (error) {
      console.debug('[StudyX] Failed to read last reminder notification date:', error.message);
    }
    if (lastNotified === today) return;

    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        (() => {
          try {
            const activeRaw = localStorage.getItem('studyx-user');
            const activeState = activeRaw ? JSON.parse(activeRaw)?.state ?? JSON.parse(activeRaw) : null;
            const profileId = activeState?.activeProfileId ?? '';
            const perProfileRaw = profileId ? localStorage.getItem(\`studyx-p-\${profileId}-stats\`) : null;
            const perProfile = perProfileRaw ? JSON.parse(perProfileRaw) : null;
            return {
              profileId,
              localLastStudyDate: perProfile?.streak?.lastStudyDate ?? perProfile?.state?.streak?.lastStudyDate ?? '',
            };
          } catch { return { profileId: '', localLastStudyDate: '' }; }
        })()
      `).then(async (payload) => {
        const profileId = typeof payload?.profileId === 'string' ? payload.profileId : '';
        const localLastStudyDate = typeof payload?.localLastStudyDate === 'string' ? payload.localLastStudyDate : '';
        const diskLastStudyDate = await readDiskLastStudyDate(profileId);
        const lastStudy = diskLastStudyDate || localLastStudyDate;
        if (lastStudy !== today) {
          new Notification({
            title: 'StudyX - Ai studiat azi?',
            body: 'Nu uita s\u0103-\u021Bi faci sesiunea de grile de azi! Men\u021Bine seria!',
          }).show();
          try {
            await fsp.writeFile(stored, today);
          } catch (error) {
            console.warn('[StudyX] Failed to write reminder notification date:', error.message);
          }
        }
      }).catch((error) => {
        console.warn('[Reminder] Failed to evaluate reminder state:', error);
      });
    }
  };
  setTimeout(checkAndNotify, 5000);
  setInterval(checkAndNotify, 60 * 60 * 1000);
}

// App Lifecycle

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Un pas de pornire care eșuează (antivirus/EPERM, disc plin) nu trebuie să blocheze deschiderea ferestrei.
    for (const step of [runPendingHardResetCleanup, migrateLegacyUserData, pruneStaleOverlay, clearCodeCacheOnVersionChange]) {
      try {
        await step();
      } catch (error) {
        console.warn(`[StudyX] Startup step ${step.name} failed:`, error?.message || String(error));
      }
    }
    const ud = app.getPath('userData');
    const sentinelPath = path.join(ud, '.first-run');
    try {
      await fsp.access(sentinelPath);
    } catch {
      // Sentinel lipsă: șterge storage-ul doar la o instalare cu adevărat nouă (fără profile/date existente).
      let freshInstall = false;
      try {
        freshInstall = shouldClearStorageOnFirstRun(inspectUserData(ud));
      } catch { freshInstall = false; }
      if (freshInstall) {
        try {
          await session.defaultSession.clearStorageData();
        } catch (error) {
          console.warn('[StudyX] Failed to clear storage data on first run:', error.message);
        }
      }
      try {
        await fsp.mkdir(ud, { recursive: true });
      } catch (error) {
        console.warn('[StudyX] Failed to create user data directory:', error.message);
      }
      try {
        await fsp.writeFile(sentinelPath, new Date().toISOString());
      } catch (error) {
        console.warn('[StudyX] Failed to write first-run sentinel:', error.message);
      }
    }
    registerIpcHandlers();
    createWindow();
    scheduleBackgroundTasks();
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', async () => {
  try {
    if (ocrWorkerPromise) {
      const worker = await ocrWorkerPromise;
      await worker.terminate();
      ocrWorkerPromise = null;
    }
  } catch (error) {
    console.warn('[StudyX] Failed to terminate OCR worker:', error.message);
  }
});
