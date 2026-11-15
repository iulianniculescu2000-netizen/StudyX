'use strict';

const path = require('path');
const { fileURLToPath } = require('url');
const { isPathInside } = require('./paths.cjs');

/**
 * profileId/namespace: string non-gol, de lungime rezonabilă. Caracterele neobișnuite NU se resping: `storage:save/load`
 * le înlocuiesc cu `_` (așa a funcționat mereu), iar respingerea lor ar face inaccesibile datele existente ale unui profil.
 */
function isSafeStorageId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

/**
 * Cine are voie să apeleze canalele IPC: DOAR cadrul de sus al ferestrei principale, încărcat din aplicația însăși.
 *  - aplicația împachetată: o pagină `file://` aflată într-unul dintre folderele `appRoots` (dist-ul livrat și, după o actualizare
 *    de tip „overlay”, copia din profilul utilizatorului, scrisă de updater);
 *  - dezvoltare: exact originea serverului de dezvoltare (`devUrl`), doar dacă `isDev`.
 * Orice altceva (alt cadru, iframe, `about:blank`, `data:`, alt site, `file://` din afara aplicației, cadru lipsă) e respins.
 *
 * @param {{ senderFrame?: { url?: string, parent?: unknown } | null }} event evenimentul IPC al lui Electron
 * @param {{ getMainWindow: () => any, appRoots?: string[], devUrl?: string | null, isDev?: boolean }} ctx
 */
function isTrustedSender(event, ctx) {
  try {
    const frame = event && event.senderFrame;
    if (!frame || typeof frame.url !== 'string' || !ctx) return false;
    if (frame.parent) return false;
    const win = typeof ctx.getMainWindow === 'function' ? ctx.getMainWindow() : null;
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return false;
    const contents = win.webContents;
    if (!contents || !contents.mainFrame || contents.mainFrame !== frame) return false;

    const url = new URL(frame.url);
    if (url.protocol === 'file:') {
      if (url.host && url.host !== 'localhost') return false;
      const filePath = fileURLToPath(url);
      const roots = Array.isArray(ctx.appRoots) ? ctx.appRoots : [];
      return roots.some((root) => typeof root === 'string' && root && path.isAbsolute(root) && isPathInside(root, filePath));
    }
    if (ctx.isDev && ctx.devUrl) {
      const dev = new URL(ctx.devUrl);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === dev.origin;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = { isSafeStorageId, isTrustedSender };
