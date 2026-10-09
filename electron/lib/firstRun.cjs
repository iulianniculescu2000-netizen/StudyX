'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Decizie pură: se șterge storage-ul Chromium DOAR la o instalare cu adevărat nouă.
 * Orice urmă de date de utilizator => nu se șterge nimic (doar se creează .first-run).
 */
function shouldClearStorageOnFirstRun(state) {
  if (!state || state.sentinelExists) return false;
  if (state.hasProfileFiles) return false;
  if (state.hasOtherUserData) return false;
  if (state.hasChromiumStorageData) return false;
  return true;
}

// Fișiere/foldere create de Electron/Chromium sau de aplicație care NU sunt date de utilizator.
const IGNORED_ENTRIES = new Set([
  '.first-run', '.last-run-version.json', 'last-run-version.json', 'Cache', 'Code Cache', 'GPUCache', 'DawnCache',
  'DawnGraphiteCache', 'DawnWebGPUCache', 'GrShaderCache', 'ShaderCache', 'Crashpad', 'blob_storage', 'logs',
  'Network', 'Partitions', 'Session Storage', 'Shared Dictionary', 'SharedStorage', 'Local State', 'Preferences',
  'Cookies', 'Cookies-journal', 'lockfile', 'TransportSecurity', 'Trust Tokens', 'Trust Tokens-journal',
  'component_crx_cache', 'Dictionaries', 'Service Worker', 'WebStorage', 'Local Storage', 'IndexedDB',
  'Singleton', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'window-state.json', 'app-overlay',
]);

function dirHasContent(dir) {
  try {
    return fs.readdirSync(dir).some((name) => {
      try {
        const st = fs.statSync(path.join(dir, name));
        if (st.isDirectory()) return dirHasContent(path.join(dir, name));
        return st.size > 0 && name !== 'LOCK' && name !== 'LOG' && name !== 'LOG.old' && name !== 'CURRENT';
      } catch { return true; }
    });
  } catch { return false; }
}

/** Inspectează userData și întoarce starea pentru shouldClearStorageOnFirstRun. Dacă ceva nu poate fi citit, presupune date existente (sigur). */
function inspectUserData(userDataDir) {
  const state = { sentinelExists: false, hasProfileFiles: false, hasOtherUserData: false, hasChromiumStorageData: false };
  try {
    state.sentinelExists = fs.existsSync(path.join(userDataDir, '.first-run'));
    const profilesDir = path.join(userDataDir, 'profiles');
    if (fs.existsSync(profilesDir)) {
      const stack = [profilesDir];
      while (stack.length && !state.hasProfileFiles) {
        const cur = stack.pop();
        for (const name of fs.readdirSync(cur)) {
          const full = path.join(cur, name);
          const st = fs.statSync(full);
          if (st.isDirectory()) stack.push(full);
          else if (/\.json(\.|$)/i.test(name) || st.size > 0) { state.hasProfileFiles = true; break; }
        }
      }
    }
    if (fs.existsSync(userDataDir)) {
      state.hasOtherUserData = fs.readdirSync(userDataDir).some((name) => !IGNORED_ENTRIES.has(name) && name !== 'profiles');
    }
    state.hasChromiumStorageData = dirHasContent(path.join(userDataDir, 'Local Storage'))
      || dirHasContent(path.join(userDataDir, 'IndexedDB'));
  } catch {
    state.hasOtherUserData = true;
  }
  return state;
}

module.exports = { shouldClearStorageOnFirstRun, inspectUserData };
