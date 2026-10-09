/**
 * StudyX updater.
 *
 * Delivery strategy:
 * - packaged app: native electron-updater or full installer fallback
 * - development/unpackaged app: overlay updates for renderer assets
 */

const { ipcMain, app, shell } = require('electron');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isNewerVersion, compareVersion } = require('./lib/versions.cjs');
const { isPathInside } = require('./lib/paths.cjs');
const { friendlyUpdateError } = require('./lib/updateErrors.cjs');
const isDev = !app.isPackaged;

const UPDATE_REPO_RAW = 'https://raw.githubusercontent.com/iulianniculescu2000-netizen/studyx-releases/main';
const UPDATE_REPO_CDN = 'https://cdn.jsdelivr.net/gh/iulianniculescu2000-netizen/studyx-releases@main';
const VERSION_URLS = [
  `${UPDATE_REPO_RAW}/version.json`,
  `${UPDATE_REPO_CDN}/version.json`,
];
const HISTORY_URLS = [
  `${UPDATE_REPO_RAW}/version-history.json`,
  `${UPDATE_REPO_CDN}/version-history.json`,
];
const USER_AGENT = 'StudyX-Updater/3.0 (Electron; Windows)';
const CONNECT_TIMEOUT_MS = 20000;
const DOWNLOAD_TIMEOUT_MS = 90000;
const MAX_RETRIES = 3; // total încercări (inclusiv prima)
const GITHUB_RELEASE_TAG_API = 'https://api.github.com/repos/iulianniculescu2000-netizen/studyx-releases/releases/tags';
const GITHUB_RELEASE_LATEST_API = 'https://api.github.com/repos/iulianniculescu2000-netizen/studyx-releases/releases/latest';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/iulianniculescu2000-netizen/studyx-releases/releases?per_page=50';

let nativeUpdater = null;
let nativeUpdaterBound = false;
let nativeUpdateInfo = null;
let nativeUpdateDownloaded = false;

function logUpdater(...args) {
  try {
    console.log('[Updater]', ...args);
  } catch {}
}

function resolveRedirectUrl(baseUrl, location) {
  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return location;
  }
}

function getProtocol(url) {
  return url.startsWith('https') ? https : http;
}

function fetchText(url, attempt = 0) {
  return new Promise((resolve, reject) => {
    const finalUrl = url.includes('?') ? `${url}&_ts=${Date.now()}` : `${url}?_ts=${Date.now()}`;
    const protocol = getProtocol(finalUrl);
    const req = protocol.get(finalUrl, {
      timeout: CONNECT_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (attempt >= 5) {
          reject(new Error('Prea multe redirectări'));
          return;
        }
        res.resume();
        fetchText(resolveRedirectUrl(finalUrl, res.headers.location), attempt + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Serverul a returnat ${res.statusCode}`));
        return;
      }

      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

      let data = '';
      stream.on('data', (chunk) => { data += chunk; });
      stream.on('end', () => resolve(data));
      stream.on('error', reject);
    });

    req.on('timeout', () => req.destroy(new Error('Conexiunea a expirat')));
    req.on('error', (err) => reject(new Error(`Eroare de rețea: ${err.message}`)));
  });
}

async function fetchJson(url) {
  const raw = await fetchText(url);
  const sanitized = String(raw).replace(/^\uFEFF/, '').trim();
  const firstChar = sanitized[0];
  if (firstChar !== '{' && firstChar !== '[') {
    const preview = sanitized.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`Răspuns invalid de la server (${preview || 'gol'})`);
  }
  return JSON.parse(sanitized);
}

function getFallbackUrls(url) {
  if (!url) return [];
  const urls = [url];
  if (url.startsWith('https://raw.githubusercontent.com/')) {
    urls.push(url.replace(UPDATE_REPO_RAW, UPDATE_REPO_CDN));
  }
  return [...new Set(urls)];
}

async function fetchJsonFromAny(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      logUpdater('Trying metadata URL:', url);
      return await fetchJson(url);
    } catch (err) {
      logUpdater('Metadata URL failed:', url, err?.message || err);
      lastError = err;
    }
  }
  throw lastError ?? new Error('Nu s-au putut descărca informațiile despre actualizare.');
}

async function fetchGithubRelease(version) {
  if (!version) return null;
  const tag = String(version).startsWith('v') ? String(version) : `v${version}`;
  try {
    return await fetchJson(`${GITHUB_RELEASE_TAG_API}/${tag}`);
  } catch (err) {
    logUpdater('GitHub release metadata failed:', tag, err?.message || err);
    return null;
  }
}

async function fetchLatestGithubRelease() {
  try {
    return await fetchJson(GITHUB_RELEASE_LATEST_API);
  } catch (err) {
    logUpdater('GitHub latest release metadata failed:', err?.message || err);
    return null;
  }
}

function normalizeGithubRelease(release, localVersion, metadata = {}) {
  if (!release?.tag_name) return null;
  const version = String(release.tag_name).replace(/^v/, '');
  const installerAsset = Array.isArray(release.assets)
    ? release.assets.find((asset) => /\.exe$/i.test(asset?.name || '') && !/blockmap/i.test(asset?.name || ''))
    : null;

  return {
    hasUpdate: isNewerVersion(localVersion, version),
    version,
    latestVersion: metadata.latestVersion ?? version,
    releaseDate: normalizeReleaseDate(release.published_at || release.created_at),
    changes: normalizeReleaseNotes(release.body || '', version),
    localVersion,
    files: [],
    contentUpdates: [],
    installer: installerAsset
      ? {
          url: installerAsset.browser_download_url,
          fileName: installerAsset.name,
          sha256: typeof installerAsset.digest === 'string' && installerAsset.digest.startsWith('sha256:')
            ? installerAsset.digest.slice('sha256:'.length)
            : undefined,
          size: installerAsset.size,
        }
      : undefined,
    delivery: app.isPackaged && installerAsset ? 'installer' : 'overlay',
    isSequential: metadata.isSequential ?? false,
    stepsRemaining: metadata.stepsRemaining ?? (isNewerVersion(localVersion, version) ? 1 : 0),
  };
}

async function fetchGithubReleases() {
  try {
    const releases = await fetchJson(GITHUB_RELEASES_API);
    return Array.isArray(releases) ? releases : [];
  } catch (err) {
    logUpdater('GitHub releases list failed:', err?.message || err);
    return [];
  }
}

function pickSequentialGithubRelease(localVersion, releases) {
  const usable = releases
    .filter((release) => release && !release.draft && !release.prerelease && release.tag_name)
    .map((release) => normalizeGithubRelease(release, localVersion))
    .filter((release) => release?.installer?.url)
    .sort((left, right) => compareVersion(left.version, right.version));

  if (usable.length === 0) return null;

  const latest = usable[usable.length - 1];
  const candidates = usable.filter((release) => compareVersion(localVersion, release.version) < 0);
  if (candidates.length === 0) {
    return {
      ...buildNoUpdateResponse(localVersion, latest.version),
      delivery: latest.delivery,
      isSequential: true,
      stepsRemaining: 0,
    };
  }

  const next = candidates[0];
  return {
    ...next,
    latestVersion: latest.version,
    isSequential: true,
    stepsRemaining: candidates.length,
  };
}

function downloadFile(url, destPath, onProgress, attempt = 0) {
  return new Promise((resolve, reject) => {
    const tmpPath = `${destPath}.studyx.tmp`;
    let retried = false;

    // Reîncearcă (cu pauză) la erori de request SAU de stream/dimensiune; o singură dată per încercare.
    const retryOrReject = (err) => {
      if (retried) return;
      retried = true;
      if (attempt < MAX_RETRIES - 1) {
        setTimeout(() => {
          downloadFile(url, destPath, onProgress, attempt + 1).then(resolve).catch(reject);
        }, 1500 * (attempt + 1));
      } else {
        reject(new Error(`Descărcarea a eșuat după ${MAX_RETRIES} încercări: ${err.message}`));
      }
    };

    const doDownload = (targetUrl, hop = 0) => {
      const protocol = getProtocol(targetUrl);
      const req = protocol.get(targetUrl, {
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': '*/*',
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache',
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (hop >= 5) {
            reject(new Error('Prea multe redirectări la descărcare'));
            return;
          }
          res.resume();
          doDownload(resolveRedirectUrl(targetUrl, res.headers.location), hop + 1);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Serverul a returnat ${res.statusCode} pentru ${path.basename(destPath)}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
        const file = fs.createWriteStream(tmpPath);

        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) {
            const percent = total > 0 ? Math.round((received / total) * 100) : -1;
            onProgress(percent, received, total);
          }
        });

        res.on('error', (err) => {
          file.destroy();
          fs.unlink(tmpPath, () => {});
          retryOrReject(new Error(`Eroare stream: ${err.message}`));
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            let stat;
            try {
              stat = fs.statSync(tmpPath);
            } catch (err) {
              reject(new Error(`Fișierul descărcat lipsește: ${err.message}`));
              return;
            }

            if (total > 0 && stat.size !== total) {
              fs.unlink(tmpPath, () => {});
              retryOrReject(new Error(`Descărcarea s-a întrerupt (${stat.size} din ${total} octeți).`));
              return;
            }

            if (stat.size < 100) {
              fs.unlink(tmpPath, () => {});
              reject(new Error(`Fișier descărcat invalid (${stat.size} octeți)`));
              return;
            }

            fs.rename(tmpPath, destPath, (renameErr) => {
              if (!renameErr) {
                resolve(stat.size);
                return;
              }

              try {
                fs.copyFileSync(tmpPath, destPath);
                fs.unlinkSync(tmpPath);
                resolve(stat.size);
              } catch (copyErr) {
                reject(new Error(`Nu s-a putut scrie fișierul: ${copyErr.message}`));
              }
            });
          });
        });

        file.on('error', (err) => {
          res.destroy();
          fs.unlink(tmpPath, () => {});
          reject(new Error(`Eroare la scrierea fișierului: ${err.message}`));
        });
      });

      req.on('timeout', () => req.destroy(new Error('Descărcarea a expirat')));
      req.on('error', (err) => {
        fs.unlink(tmpPath, () => {});
        retryOrReject(err);
      });
    };

    doDownload(url);
  });
}

function getAppRoot() {
  if (app.isPackaged) {
    try {
      return app.getAppPath();
    } catch {}
  }
  return path.join(__dirname, '..');
}

function getOverlayRoot() {
  return path.join(app.getPath('userData'), 'app-overlay');
}

function getInstallerDownloadDir() {
  return path.join(app.getPath('userData'), 'installer-updates');
}

function getAppUpdateConfigPath() {
  return path.join(process.resourcesPath, 'app-update.yml');
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sourcePath = path.join(src, entry.name);
    const targetPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

function sanitizeDownloadName(name, fallbackName) {
  const clean = String(name || fallbackName || 'StudyX-Setup.exe').replace(/[^a-z0-9._ -]/gi, '_').trim();
  return clean.toLowerCase().endsWith('.exe') ? clean : `${clean}.exe`;
}

function normalizeReleaseDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function normalizeReleaseNotes(notes, fallbackVersion) {
  if (Array.isArray(notes)) {
    return notes
      .flatMap((entry) => normalizeReleaseNotes(entry?.note ?? entry, fallbackVersion))
      .filter(Boolean);
  }

  if (typeof notes !== 'string') {
    return fallbackVersion ? [`StudyX ${fallbackVersion}`] : ['StudyX update'];
  }

  const lines = notes
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean);

  return lines.length > 0 ? lines : (fallbackVersion ? [`StudyX ${fallbackVersion}`] : ['StudyX update']);
}

function bindNativeUpdaterEvents(autoUpdater) {
  if (nativeUpdaterBound) return;
  nativeUpdaterBound = true;

  autoUpdater.on('update-available', (info) => {
    nativeUpdateInfo = info;
    nativeUpdateDownloaded = false;
  });

  autoUpdater.on('update-not-available', () => {
    nativeUpdateDownloaded = false;
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:progress', {
      percent: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))),
      file: progress?.bytesPerSecond ? 'Actualizare StudyX' : 'Se descarcă actualizarea',
      received: progress?.transferred ?? 0,
      total: progress?.total ?? 0,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    nativeUpdateInfo = info;
    nativeUpdateDownloaded = true;
    sendToRenderer('updater:progress', {
      percent: 100,
      file: info?.version ? `StudyX ${info.version}` : 'Actualizare pregătită',
      received: -1,
      total: -1,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Native auto-update error:', err);
  });
}

function getNativeUpdater() {
  if (isDev || !app.isPackaged) return null;
  if (nativeUpdater) return nativeUpdater;
  if (!fs.existsSync(getAppUpdateConfigPath())) return null;

  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    bindNativeUpdaterEvents(autoUpdater);
    nativeUpdater = autoUpdater;
    return nativeUpdater;
  } catch (err) {
    console.warn('[Updater] Native auto-updater unavailable, falling back to legacy updater.', err);
    return null;
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function normalizeManifest(rawManifest) {
  const manifest = rawManifest && typeof rawManifest === 'object' ? rawManifest : {};
  const installer = manifest.installer && typeof manifest.installer === 'object' ? manifest.installer : null;
  const delivery = app.isPackaged && installer?.url ? 'installer' : 'overlay';
  return {
    version: manifest.version,
    latestVersion: manifest.latestVersion ?? manifest.version,
    releaseDate: manifest.releaseDate ?? '',
    changes: Array.isArray(manifest.changes) ? manifest.changes : [],
    files: Array.isArray(manifest.files) ? manifest.files : [],
    contentUpdates: Array.isArray(manifest.contentUpdates) ? manifest.contentUpdates : [],
    installer,
    delivery,
  };
}

function buildNoUpdateResponse(localVersion, latestVersion = localVersion) {
  return {
    hasUpdate: false,
    version: localVersion,
    latestVersion,
    releaseDate: '',
    changes: [],
    localVersion,
    files: [],
    contentUpdates: [],
    delivery: app.isPackaged ? 'native' : 'overlay',
    isSequential: false,
    stepsRemaining: 0,
  };
}

function buildInstallerResponse(localVersion, manifest, latestVersionOverride) {
  const version = manifest.version || latestVersionOverride || localVersion;
  const latestVersion = latestVersionOverride || manifest.latestVersion || version;
  const hasUpdate = isNewerVersion(localVersion, version);

  return {
    hasUpdate,
    version,
    latestVersion,
    releaseDate: manifest.releaseDate,
    changes: manifest.changes,
    localVersion,
    files: [],
    contentUpdates: manifest.contentUpdates,
    installer: manifest.installer,
    delivery: 'installer',
    isSequential: false,
    stepsRemaining: hasUpdate ? 1 : 0,
  };
}

function getLocalVersion() {
  if (app.isPackaged && getNativeUpdater()) {
    try {
      return app.getVersion();
    } catch {}
  }

  if (!app.isPackaged) {
    try {
      const overlayManifest = path.join(getOverlayRoot(), 'manifest.json');
      if (fs.existsSync(overlayManifest)) {
        const manifest = JSON.parse(fs.readFileSync(overlayManifest, 'utf-8'));
        if (manifest.version) return manifest.version;
      }
    } catch {}
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(getAppRoot(), 'package.json'), 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

let mainWindowRef = null;

function sendToRenderer(event, data) {
  try {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send(event, data);
    }
  } catch {}
}

async function downloadInstaller(manifest) {
  const installer = manifest?.installer;
  if (!installer?.url) throw new Error('Manifestul nu conține installerul complet.');

  const downloadDir = getInstallerDownloadDir();
  const fileName = sanitizeDownloadName(
    installer.fileName,
    path.basename(new URL(installer.url).pathname) || `StudyX-Setup-${manifest.version || 'latest'}.exe`,
  );
  const destPath = path.join(downloadDir, fileName);

  fs.mkdirSync(downloadDir, { recursive: true });

  await downloadFile(installer.url, destPath, (percent, received, total) => {
    sendToRenderer('updater:progress', {
      percent: percent > 0 ? percent : 50,
      file: fileName,
      received,
      total,
    });
  });

  if (installer.sha256) {
    const hash = await sha256File(destPath);
    if (hash.toLowerCase() !== String(installer.sha256).toLowerCase()) {
      try { fs.unlinkSync(destPath); } catch {}
      throw new Error('Verificarea de integritate a installerului a eșuat.');
    }
  }

  sendToRenderer('updater:progress', { percent: 100, file: fileName, received: -1, total: -1 });
  return { mode: 'installer', path: destPath, fileName };
}

async function checkNativeForUpdates() {
  const autoUpdater = getNativeUpdater();
  if (!autoUpdater) return null;

  nativeUpdateDownloaded = false;
  const localVersion = app.getVersion();
  const result = await autoUpdater.checkForUpdates();
  const info = result?.updateInfo;

  if (!info?.version) {
    return {
      hasUpdate: false,
      version: localVersion,
      latestVersion: localVersion,
      releaseDate: '',
      changes: [],
      localVersion,
      files: [],
      contentUpdates: [],
      delivery: 'native',
      isSequential: false,
      stepsRemaining: 0,
    };
  }

  nativeUpdateInfo = info;
  const hasUpdate = isNewerVersion(localVersion, info.version);

  return {
    hasUpdate,
    version: info.version,
    latestVersion: info.version,
    releaseDate: normalizeReleaseDate(info.releaseDate),
    changes: normalizeReleaseNotes(info.releaseNotes, info.version),
    localVersion,
    files: [],
    installer: info.files?.[0]
      ? {
          url: info.files[0].url || '',
          fileName: info.files[0].url ? path.basename(String(info.files[0].url)) : undefined,
        }
      : undefined,
    delivery: 'native',
    isSequential: false,
    stepsRemaining: hasUpdate ? 1 : 0,
    contentUpdates: [],
  };
}

async function downloadNativeUpdate() {
  const autoUpdater = getNativeUpdater();
  if (!autoUpdater) throw new Error('Sistemul nativ de actualizare nu este disponibil.');
  await autoUpdater.downloadUpdate();
  return { mode: 'native' };
}

async function downloadOverlay(manifest) {
  if (app.isPackaged) {
    throw new Error('Actualizările overlay sunt dezactivate în versiunile instalate. Folosește actualizarea prin installer.');
  }

  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  if (files.length === 0) throw new Error('Manifestul nu conține fișiere de actualizat.');

  const overlayRoot = getOverlayRoot();
  const overlayDist = path.join(overlayRoot, 'files', 'dist');
  const installDist = path.join(getAppRoot(), 'dist');
  const sentinelPath = path.join(overlayRoot, '.bootstrap-ok');

  if ((!fs.existsSync(overlayDist) || !fs.existsSync(sentinelPath)) && fs.existsSync(installDist)) {
    sendToRenderer('updater:progress', { percent: 2, file: 'Pregătire overlay...', received: 0, total: 0 });
    try {
      if (fs.existsSync(overlayRoot)) fs.rmSync(overlayRoot, { recursive: true, force: true });
      copyDirSync(installDist, overlayDist);
      fs.writeFileSync(sentinelPath, 'OK', 'utf-8');
    } catch (err) {
      throw new Error(`Nu s-a putut crea overlay-ul local: ${err.message}`);
    }
  }

  let completed = 0;
  const downloadedPaths = [];
  for (const file of files) {
    const safePath = path.normalize(file.path).replace(/^(\.\.[/\\])+/, '');
    const overlayFilesRoot = path.join(overlayRoot, 'files');
    const destPath = path.join(overlayFilesRoot, safePath);
    if (!isPathInside(overlayFilesRoot, destPath)) {
      throw new Error(`Cale invalidă în manifest: ${file.path}`);
    }

    try {
      await downloadFile(file.url, destPath, (percent, received, total) => {
        const overall = Math.round(((completed + (percent > 0 ? percent / 100 : 0.5)) / files.length) * 90) + 5;
        sendToRenderer('updater:progress', {
          percent: Math.min(overall, 97),
          file: path.basename(file.path),
          received,
          total,
        });
      });

      // Verify hash if manifest provides one
      if (file.sha256) {
        const actualHash = await sha256File(destPath);
        if (actualHash.toLowerCase() !== String(file.sha256).toLowerCase()) {
          // Remove the corrupt file so a future update attempt won't use it
          try { fs.unlinkSync(destPath); } catch {}
          throw new Error(`Hash invalid pentru ${path.basename(file.path)}: așteptat ${file.sha256}, primit ${actualHash}`);
        }
      }

      downloadedPaths.push(destPath);
      completed += 1;
      sendToRenderer('updater:progress', {
        percent: Math.round((completed / files.length) * 90) + 5,
        file: path.basename(file.path),
        received: -1,
        total: -1,
      });
    } catch (err) {
      // Roll back all files downloaded so far to leave overlay in a clean state
      for (const p of downloadedPaths) {
        try { fs.unlinkSync(p); } catch {}
      }
      throw new Error(`Eroare la ${path.basename(file.path)}: ${err.message}`);
    }
  }

  try {
    fs.writeFileSync(
      path.join(overlayRoot, 'manifest.json'),
      JSON.stringify({ version: manifest.version, files: manifest.files }, null, 2),
      'utf-8',
    );
  } catch (err) {
    throw new Error(`Nu s-a putut salva manifestul local: ${err.message}`);
  }

  sendToRenderer('updater:progress', { percent: 100, file: 'Gata!', received: -1, total: -1 });
  return { mode: 'overlay' };
}

function registerUpdaterIPC(mainWindow, hooks = {}) {
  mainWindowRef = mainWindow;

  try { ipcMain.removeHandler('updater:check'); } catch {}
  try { ipcMain.removeHandler('updater:download'); } catch {}
  try { ipcMain.removeHandler('updater:restart'); } catch {}
  try { ipcMain.removeHandler('updater:getVersion'); } catch {}
  try { ipcMain.removeHandler('updater:install-downloaded'); } catch {}

  ipcMain.handle('updater:check', async () => {
    const localVersion = getLocalVersion();
    try {
      let nativeResult = null;
      let packagedManifestResult = null;
      let githubFallbackResult = null;

      try {
        nativeResult = await checkNativeForUpdates();
        if (nativeResult?.hasUpdate) {
          return nativeResult;
        }
      } catch (nativeErr) {
        console.warn('[Updater] Native check failed, falling back to legacy updater:', nativeErr);
      }

      if (app.isPackaged) {
        try {
          const versionMeta = await fetchJsonFromAny(VERSION_URLS);
          const latestVersion = String(versionMeta?.version || '').trim();
          if (latestVersion) {
            const manifestUrl = typeof versionMeta?.manifestUrl === 'string'
              ? versionMeta.manifestUrl
              : `${UPDATE_REPO_RAW}/manifests/${latestVersion}.json`;
            const manifest = normalizeManifest(await fetchJsonFromAny(getFallbackUrls(manifestUrl)));
            if (manifest.version && manifest.installer?.url) {
              packagedManifestResult = buildInstallerResponse(localVersion, manifest, latestVersion);
              if (packagedManifestResult.hasUpdate) {
                return packagedManifestResult;
              }
            }
          }
        } catch (versionErr) {
          logUpdater('Packaged manifest fallback failed:', versionErr?.message || versionErr);
        }

        const fallbackRelease = await fetchLatestGithubRelease() || await fetchGithubRelease(localVersion);
        if (fallbackRelease) {
          const normalized = normalizeGithubRelease(fallbackRelease, localVersion);
          if (normalized?.hasUpdate) return normalized;
          githubFallbackResult = normalized;
        }

        if (packagedManifestResult && githubFallbackResult) {
          return compareVersion(packagedManifestResult.latestVersion, githubFallbackResult.latestVersion) >= 0
            ? packagedManifestResult
            : githubFallbackResult;
        }
        if (packagedManifestResult) return packagedManifestResult;
        if (nativeResult) return nativeResult;
        if (githubFallbackResult) return githubFallbackResult;

        throw new Error('Nu există informații valide pentru actualizarea installerului.');
      }

      const history = await fetchJsonFromAny(HISTORY_URLS);
      const entries = Array.isArray(history?.versions) ? history.versions : [];
      const versions = entries
        .filter((entry) => entry && typeof entry.version === 'string' && typeof entry.manifestUrl === 'string')
        .sort((left, right) => compareVersion(left.version, right.version));

      if (versions.length > 0) {
        const latest = versions[versions.length - 1];
        const candidates = versions.filter((entry) => compareVersion(localVersion, entry.version) < 0);
        if (candidates.length === 0) {
          return {
            hasUpdate: false,
            version: localVersion,
            latestVersion: latest.version,
            releaseDate: '',
            changes: [],
            localVersion,
            files: [],
            contentUpdates: [],
            delivery: 'overlay',
            isSequential: true,
            stepsRemaining: 0,
          };
        }

        let resolved = null;
        for (const candidate of candidates) {
          try {
            const manifest = normalizeManifest(await fetchJsonFromAny(getFallbackUrls(candidate.manifestUrl)));
            resolved = { candidate, manifest };
            break;
          } catch (manifestErr) {
            logUpdater('Skipping invalid manifest from history:', candidate.manifestUrl, manifestErr?.message || manifestErr);
          }
        }

        if (resolved) {
          return {
            hasUpdate: true,
            version: resolved.manifest.version ?? resolved.candidate.version,
            latestVersion: latest.version,
            releaseDate: resolved.manifest.releaseDate,
            changes: resolved.manifest.changes,
            localVersion,
            files: resolved.manifest.files,
            contentUpdates: resolved.manifest.contentUpdates,
            installer: resolved.manifest.installer,
            delivery: resolved.manifest.delivery,
            isSequential: true,
            stepsRemaining: candidates.length,
          };
        }
      }

      try {
        const versionMeta = await fetchJsonFromAny(VERSION_URLS);
        const latestVersion = String(versionMeta?.version || '').trim();
        if (!latestVersion) throw new Error('Informații invalide: lipsește versiunea publică');
        const manifestUrl = typeof versionMeta?.manifestUrl === 'string'
          ? versionMeta.manifestUrl
          : `${UPDATE_REPO_RAW}/manifests/${latestVersion}.json`;
        const manifest = normalizeManifest(await fetchJsonFromAny(getFallbackUrls(manifestUrl)));
        if (!manifest.version) throw new Error('Manifest invalid: lipsește câmpul version');
        const hasUpdate = isNewerVersion(localVersion, manifest.version);
        return {
          hasUpdate,
          version: manifest.version,
          latestVersion: manifest.latestVersion ?? latestVersion,
          releaseDate: manifest.releaseDate,
          changes: manifest.changes,
          localVersion,
          files: manifest.files,
          contentUpdates: manifest.contentUpdates,
          installer: manifest.installer,
          delivery: manifest.delivery,
          isSequential: false,
          stepsRemaining: hasUpdate ? 1 : 0,
        };
      } catch (versionErr) {
        logUpdater('Version metadata fallback failed:', versionErr?.message || versionErr);
      }

      const githubReleases = await fetchGithubReleases();
      const sequentialGithubRelease = pickSequentialGithubRelease(localVersion, githubReleases);
      if (sequentialGithubRelease) {
        return sequentialGithubRelease;
      }

      const fallbackRelease = await fetchLatestGithubRelease() || await fetchGithubRelease(localVersion);
      if (fallbackRelease) {
        const normalized = normalizeGithubRelease(fallbackRelease, localVersion);
        if (normalized) return normalized;
      }

      throw new Error('Nu există informații valide pentru actualizare.');
    } catch (err) {
      logUpdater('Check failed, returning graceful fallback:', err?.message || err);
      return buildNoUpdateResponse(localVersion);
    }
  });

  ipcMain.handle('updater:download', async (_, manifest) => {
    try {
      if (manifest?.delivery === 'native') {
        return await downloadNativeUpdate();
      }

      if (manifest?.delivery === 'installer' || (app.isPackaged && manifest?.installer?.url)) {
        return await downloadInstaller(manifest);
      }
      return await downloadOverlay(manifest);
    } catch (err) {
      console.error('[Updater] Download failed:', err);
      throw new Error(friendlyUpdateError(err));
    }
  });

  ipcMain.handle('updater:restart', async () => {
    if (typeof hooks.prepareForQuit === 'function') {
      try { await hooks.prepareForQuit(); } catch (e) { console.warn('[Updater] prepareForQuit:', e?.message || e); }
    }
    app.relaunch();
    app.quit();
  });

  ipcMain.handle('updater:getVersion', () => getLocalVersion());

  ipcMain.handle('updater:install-downloaded', async (_, installerPath) => {
    if (!installerPath) {
      const autoUpdater = getNativeUpdater();
      if (!autoUpdater || !nativeUpdateDownloaded) {
        throw new Error('Actualizarea nativă nu este pregătită.');
      }

      setImmediate(async () => {
        try {
          // Cere salvarea din renderer (cu timeout) înainte de închiderea pentru instalare.
          if (typeof hooks.prepareForQuit === 'function') {
            try { await hooks.prepareForQuit(); } catch (e) { console.warn('[Updater] prepareForQuit:', e?.message || e); }
          }
          autoUpdater.quitAndInstall(true, true);
        } catch (err) {
          console.error('[Updater] Failed to quitAndInstall:', err);
        }
      });
      return true;
    }

    if (!installerPath || typeof installerPath !== 'string') {
      throw new Error('Calea către installer lipsește.');
    }

    const normalized = path.normalize(installerPath);
    const root = path.normalize(getInstallerDownloadDir());
    if (!isPathInside(root, normalized) || normalized.toLowerCase().endsWith('.exe') === false) {
      throw new Error('Installer invalid.');
    }

    const openError = await shell.openPath(normalized);
    if (openError) {
      throw new Error(`Programul de instalare nu a putut fi lansat: ${openError}`);
    }

    return true;
  });
}

module.exports = { registerUpdaterIPC };
