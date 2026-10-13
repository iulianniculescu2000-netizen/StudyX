const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  destroy: () => ipcRenderer.send('win:destroy'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  setZoomFactor: (factor) => {
    try {
      if (typeof factor === 'number' && Number.isFinite(factor) && factor > 0) {
        webFrame.setZoomFactor(factor);
      }
    } catch { /* ignore */ }
  },
  getZoomFactor: () => {
    try {
      const factor = webFrame.getZoomFactor();
      return typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? factor : 1;
    } catch {
      return 1;
    }
  },
  // Theme: renderer -> main only (window background + nativeTheme)
  setTheme: (payload) => ipcRenderer.send('theme:set', payload),
  onMaximized: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on('win:maximized', handler);
    return () => ipcRenderer.removeListener('win:maximized', handler);
  },
  // File dialogs
  openJsonFiles: () => ipcRenderer.invoke('dialog:openJson'),
  openImageFile: () => ipcRenderer.invoke('dialog:openImage'),
  readOCRPath: (path) => ipcRenderer.invoke('image:readOCR', path),
  openPdfFile: () => ipcRenderer.invoke('dialog:openPdf'),
  // Electron 32+ a scos File.path: calea unui fișier ales/tras în pagină se cere așa (evită copierea întregului PDF în memorie).
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
  readPdfPath: (path) => ipcRenderer.invoke('pdf:readPath', path),
  readPdfBuffer: (buffer) => ipcRenderer.invoke('pdf:readBuffer', buffer),
  openDocxFile: () => ipcRenderer.invoke('dialog:openDocx'),
  readDocxPath: (path) => ipcRenderer.invoke('docx:readPath', path),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  // Organizare (study plan): open the files it names
  organizarePickRoot: () => ipcRenderer.invoke('organizare:pickRoot'),
  organizareOpen: (root, relPath) => ipcRenderer.invoke('organizare:open', { root, relPath }),
  organizareReadPdf: (root, relPath) => ipcRenderer.invoke('organizare:read-pdf', { root, relPath }),
  organizareListPdfs: (root, sub) => ipcRenderer.invoke('organizare:list-pdfs', { root, sub }),
  organizareResolveRoot: (root, expected) => ipcRenderer.invoke('organizare:resolve-root', { root, expected }),
  organizareDetectRoot: (expected) => ipcRenderer.invoke('organizare:detect-root', { expected }),
  organizareRootGet: (profileId) => ipcRenderer.invoke('organizare:root-get', { profileId }),
  organizareRootSet: (profileId, root) => ipcRenderer.invoke('organizare:root-set', { profileId, root }),
  // Updater
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: (manifest) => ipcRenderer.invoke('updater:download', manifest),
  updaterRestart: () => ipcRenderer.invoke('updater:restart'),
  updaterInstallDownloaded: (installerPath) => ipcRenderer.invoke('updater:install-downloaded', installerPath),
  updaterGetVersion: () => ipcRenderer.invoke('updater:getVersion'),
  onUpdateProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
  // Content protection (exam mode screenshot block)
  setContentProtection: (enabled) => ipcRenderer.invoke('win:setContentProtection', enabled),
  // Desktop notifications (agent background tasks)
  notify: (opts) => ipcRenderer.invoke('notify:show', opts),
  // CSV export (Anki)
  saveCsvFile: (opts) => ipcRenderer.invoke('dialog:saveCsv', opts),
  // Hard reset (wipe all data + relaunch)
  hardReset: () => ipcRenderer.invoke('app:hardReset'),
  // Signal Electron that React is ready (used to avoid white flash on startup)
  appReady: () => ipcRenderer.send('app:ready'),
  // Auto-backup: write all app data to Documents/StudyX-Backups
  autoBackup: (data) => ipcRenderer.invoke('app:autoBackup', { data }),
  storageSave: (profileId, namespace, serialized) => ipcRenderer.invoke('storage:save', { profileId, namespace, serialized }),
  storageLoad: (profileId, namespace) => ipcRenderer.invoke('storage:load', { profileId, namespace }),
  storageDeleteProfile: (profileId) => ipcRenderer.invoke('storage:delete-profile', { profileId }),
  onAppClose: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('app:request-close', listener);
    return () => ipcRenderer.removeListener('app:request-close', listener);
  },
  isElectron: true,
});
